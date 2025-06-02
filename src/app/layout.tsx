import type { Metadata } from "next";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Call Recording Analyzer",
  description: "Analyze call recordings with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={styles.body}>{children}</body>
    </html>
  );
}
