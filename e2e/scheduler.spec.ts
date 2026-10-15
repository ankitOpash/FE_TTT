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
