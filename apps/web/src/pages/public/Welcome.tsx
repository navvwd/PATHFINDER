import { Navigate } from "react-router";
import { homeFor, useAuth } from "@/lib/auth";
import { Hero } from "./landing/Hero";
import { Nav } from "./landing/Nav";
import { Challenges, DashboardPreview, Domains, Ecosystem, FinalCta, Footer, HowItWorks, Insights, Introduction } from "./landing/Sections";

/** Public marketing site. Signed-in users go straight to their home. */
export function Welcome() {
  const me = useAuth((s) => s.me);
  if (me) return <Navigate to={homeFor(me)} replace />;
  return (
    <div className="min-h-full bg-bg">
      <a href="#discover" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <Nav />
      <main>
        <Hero />
        <Introduction />
        <Domains />
        <HowItWorks />
        <DashboardPreview />
        <Challenges />
        <Insights />
        <Ecosystem />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
