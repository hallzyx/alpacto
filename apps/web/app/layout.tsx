import { Fraunces, Source_Sans_3, Inter, Orbitron, Geist } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { AuthProvider } from "~~/components/alpacto/AuthProvider";
import { TooltipProvider } from "~~/components/ui/tooltip";
import { buildRootMetadata } from "~~/lib/metadata";
import "~~/styles/globals.css";
import { cn } from "~~/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  weight: ["400", "500", "600", "700"],
});

/** Kept for Scaffold debug / blockexplorer surfaces. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "700", "900"],
});

export const metadata = buildRootMetadata();

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="es" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body
        className={`${fraunces.variable} ${sourceSans.variable} ${inter.variable} ${orbitron.variable} font-body`}
        suppressHydrationWarning
      >
        <ThemeProvider enableSystem={false} defaultTheme="light">
          <AuthProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
