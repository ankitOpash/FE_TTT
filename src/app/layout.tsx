import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dispatch · Post scheduler",
  description: "Compose, schedule, and review social posts from one queue.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("dispatch.theme");var root=document.documentElement;if(t==="dark"||t==="light")root.dataset.theme=t;else if(window.matchMedia("(prefers-color-scheme: dark)").matches)root.dataset.theme="dark"}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
