import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Home } from "@/pages/Home";
import { NewContract } from "@/pages/NewContract";
import { Dashboard } from "@/pages/Dashboard";
import { ContractView } from "@/pages/ContractView";
import { HowItWorks } from "@/pages/HowItWorks";
import { Moderators } from "@/pages/Moderators";
import { Pricing } from "@/pages/Pricing";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/moderators" element={<Moderators />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/new" element={<NewContract />} />
        <Route path="/contracts" element={<Dashboard />} />
        <Route path="/contracts/:id" element={<ContractView />} />
        {/* committer's shareable-link entry — same view, reached by token */}
        <Route path="/c/:id" element={<ContractView />} />
      </Route>
    </Routes>
  );
}
