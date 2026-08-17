import "./globals.css";

export const metadata = {
  title: "CFB Model",
  description: "Model lines and power ratings",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
