import { expect, test, type Page } from "@playwright/test"

async function open(page: Page, path = "/") {
  await page.goto(path)
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toBeVisible()
}

function forceRandom(page: Page, value: number) {
  return page.addInitScript((fixed) => {
    Math.random = () => fixed
  }, value)
}

test("search keeps every character when typing fast", async ({ page }) => {
  await open(page)
  const box = page.getByRole("searchbox", { name: "Search" })
  await box.pressSequentially("november workshop", { delay: 10 })
  await expect(box).toHaveValue("november workshop")
  await expect(page).toHaveURL(/q=november\+workshop/)
})

test("filters stack in the URL and survive reload and back", async ({ page }) => {
  await open(page)
  await page.getByRole("button", { name: "TikTok", exact: true }).click()
  await page.getByRole("tab", { name: /^Scheduled/ }).click()
  await expect(page).toHaveURL(/platform=tiktok&status=scheduled/)

  await page.reload()
  await expect(page.getByRole("button", { name: "TikTok", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("tab", { name: /^Scheduled/ })).toHaveAttribute("aria-selected", "true")

  await page.goBack()
  await expect(page.getByRole("button", { name: "TikTok", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true")
})

test("a failed retry restores the original error and announces the failure", async ({ page }) => {
  await forceRandom(page, 0.1)
  await open(page, "/?status=failed")
  const card = page.locator("article").filter({ hasText: "Carousel draft" })
  await expect(card).toContainText("Instagram returned a media format error")

  await card.getByRole("button", { name: /^Retry/ }).click()
  await expect(page.getByRole("alert").filter({ hasText: "The platform rejected this retry" })).toBeVisible()
  await expect(card.getByText("Failed", { exact: true })).toBeVisible()
  await expect(card).toContainText("Instagram returned a media format error")
})

test("a successful retry of a past post marks it published", async ({ page }) => {
  await forceRandom(page, 0.9)
  await open(page, "/?status=failed")
  const card = page.locator("article").filter({ hasText: "Carousel draft" })
  await card.getByRole("button", { name: /^Retry/ }).click()
  await expect(page.getByRole("alert").filter({ hasText: "marked published" })).toBeVisible()

  await page.goto("/?status=published&q=carousel")
  await expect(page.locator("article").filter({ hasText: "Carousel draft" })).toBeVisible()
})

test("reset during a retry keeps the whole queue", async ({ page }) => {
  await forceRandom(page, 0.9)
  await open(page)
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toHaveText("Showing 32 of 32")

  await page.getByRole("button", { name: /^Retry/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole("button", { name: "Reset demo data" }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toHaveText("Showing 32 of 32")

  await page.reload()
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toHaveText("Showing 32 of 32")
})

test("the composer cannot be discarded while a post is saving", async ({ page }) => {
  const dialogs: string[] = []
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message())
    void dialog.accept()
  })
  await open(page)
  await page.getByRole("button", { name: "Create post" }).first().click()
  await page.getByRole("textbox", { name: "Post" }).fill("Saving guard check")
  await page.getByRole("button", { name: "Schedule post" }).click()

  await expect(page.getByRole("button", { name: "Scheduling…" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()

  await expect(page.getByRole("alert").filter({ hasText: "Scheduled" })).toBeVisible()
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(dialogs).toEqual([])
})

test("counters use graphemes and block only real overflows", async ({ page }) => {
  await open(page)
  await page.getByRole("button", { name: "Create post" }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: "X", exact: true }).click()
  const caption = page.getByRole("textbox", { name: "Post" })
  const schedule = page.getByRole("button", { name: "Schedule post" })

  await caption.fill("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}".repeat(30))
  await expect(page.getByRole("listitem", { name: "X 30 of 280" })).toBeVisible()
  await expect(schedule).toBeEnabled()

  await caption.fill("a".repeat(281))
  await expect(page.getByText("X is 1 over its 280 limit.")).toBeVisible()
  await expect(schedule).toBeDisabled()
})

test.describe("in Pacific/Auckland", () => {
  test.use({ timezoneId: "Pacific/Auckland" })

  test("a post just after local midnight lands under Tomorrow and is stored in UTC", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: "Create post" }).first().click()
    await page.getByRole("textbox", { name: "Post" }).fill("Auckland midnight check")
    const tomorrow = await page.evaluate(() => {
      const date = new Date()
      date.setDate(date.getDate() + 1)
      const pad = (value: number) => String(value).padStart(2, "0")
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:30`
    })
    await page.getByRole("button", { name: "Custom", exact: true }).click()
    await page.getByRole("dialog").getByLabel("Schedule").fill(tomorrow)
    await page.getByRole("button", { name: "Schedule post" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    const group = page.getByRole("region", { name: /^Tomorrow/ })
    await expect(group).toContainText("Auckland midnight check")
    await expect(group.locator("article").filter({ hasText: "Auckland midnight check" }).locator("time")).toHaveText(
      "12:30 AM",
    )
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dispatch.posts.v1") ?? "[]").find(
        (post: { content: string }) => post.content === "Auckland midnight check",
      ),
    )
    expect(stored.scheduledAt).toMatch(/Z$/)
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 740 } })

  test("collapsed filters say how many are active", async ({ page }) => {
    await open(page, "/?platform=x&status=failed")
    await expect(page.getByRole("button", { name: "Filters, 2 active" })).toBeVisible()
  })
})

test("retry all follows the failed posts in this week", async ({ page }) => {
  await forceRandom(page, 0.9)
  await open(page, "/?status=failed")
  const kept = page.locator("article").filter({ hasText: "What we stopped posting" })
  await expect(kept).toBeVisible()
  await page.getByRole("button", { name: "This week" }).click()
  await expect(page).toHaveURL(/from=/)
  await expect(kept).toHaveCount(0)
  const weekCount = await page.locator("article").count()
  expect(weekCount).toBeGreaterThan(0)
  await page.getByRole("button", { name: `Retry all ${weekCount}`, exact: true }).click()
  await expect(page.locator("article").filter({ hasText: "Retrying" })).toHaveCount(weekCount)
  await page.getByRole("button", { name: "This week" }).click()
  await expect(kept).toContainText("X rejected the duplicate status")
  await expect(kept.getByText("Failed", { exact: true })).toBeVisible()
})

test("changing only the platforms asks before the edit is discarded", async ({ page }) => {
  await open(page, "/?status=scheduled")
  const card = page.locator("article").filter({ hasText: "Lunch special" })
  await card.getByRole("button", { name: "Post actions" }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const composer = page.getByRole("dialog", { name: "Edit post" })
  await composer.getByRole("button", { name: "TikTok", exact: true }).click()
  page.once("dialog", (popup) => {
    expect(popup.message()).toBe("Discard this draft?")
    void popup.dismiss()
  })
  await composer.getByRole("button", { name: "Close", exact: true }).click()
  await expect(composer).toBeVisible()
  await expect(composer.getByRole("button", { name: "TikTok", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("calendar stays in the URL after a refresh", async ({ page }) => {
  await open(page)
  await page.getByRole("button", { name: "Calendar", exact: true }).click()
  await expect(page).toHaveURL(/view=calendar/)
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Calendar", exact: true })).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "Queue", exact: true }).click()
  await expect(page).not.toHaveURL(/view=/)
  await page.getByRole("button", { name: "Commands" }).click()
  await page.getByRole("dialog", { name: "Commands" }).getByRole("button", { name: "Calendar view" }).click()
  await expect(page).toHaveURL(/view=calendar/)
  await expect(page.getByRole("button", { name: "Board", exact: true })).toBeVisible()
})

test("dragging a scheduled post onto another day moves it", async ({ page }) => {
  await open(page, "/?view=calendar&status=scheduled")
  const chip = page.getByRole("button", { name: /Lunch special/ })
  const more = page.getByRole("button", { name: /^\+\d+ more$/ })
  for (let attempt = 0; attempt < 8 && (await chip.count()) === 0; attempt += 1) {
    await more.nth(attempt).click()
  }
  await expect(chip).toBeVisible()
  const tomorrow = await page.evaluate(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  })
  const target = page.locator(`[data-date="${tomorrow}"]`)
  await page.evaluate((date) => {
    const chip = [...document.querySelectorAll("button")].find((button) =>
      (button.getAttribute("aria-label") ?? "").includes("Lunch special"),
    )
    const cell = document.querySelector(`[data-date="${date}"]`)
    if (!(chip instanceof HTMLElement) || !(cell instanceof HTMLElement)) throw new Error("missing drag nodes")
    const dataTransfer = new DataTransfer()
    chip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }))
    cell.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }))
    cell.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }))
  }, tomorrow)
  await expect(target.getByRole("button", { name: /Lunch special/ })).toBeVisible()
  await expect(page.getByRole("alert").filter({ hasText: "Post moved." })).toBeVisible()
})
