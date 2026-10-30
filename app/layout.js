import "./globals.css";

export const metadata = {
  title: "知办",
  description: "校园通知行动助手",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}