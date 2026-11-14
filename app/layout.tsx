import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
export const metadata:Metadata={
 title:{default:"Before the Click — Human approval for AI actions",template:"%s · Before the Click"},
 description:"Review AI-assisted actions, enforce policies, collect human approval and verify outcomes against authorized services.",
 metadataBase:new URL("https://before-the-click.vercel.app"),
 openGraph:{type:"website",siteName:"Before the Click",title:"Before the Click — Actions with accountability",
 description:"A real approval and verification layer between AI plans and real-world actions."}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
 return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
