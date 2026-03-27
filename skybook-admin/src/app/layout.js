import "./globals.css";

export const metadata = {
  title: "SkyBook Admin",
  description: "Secure admin panel for SkyBook operations.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
