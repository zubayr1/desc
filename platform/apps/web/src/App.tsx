import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Home } from "@/pages/Home";
import { NewContract } from "@/pages/NewContract";
import { Dashboard } from "@/pages/Dashboard";
import { ContractView } from "@/pages/ContractView";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewContract />} />
        <Route path="/contracts" element={<Dashboard />} />
        <Route path="/contracts/:id" element={<ContractView />} />
        {/* committer's shareable-link entry — same view, reached by token */}
        <Route path="/c/:id" element={<ContractView />} />
      </Route>
    </Routes>
  );
}
