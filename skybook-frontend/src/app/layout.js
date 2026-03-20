import "./globals.css";

export const metadata = {
  title: "SkyBook",
  description: "Plan your perfect trip with flights, hotels, and cars in one place.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
