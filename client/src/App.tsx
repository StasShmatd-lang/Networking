import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { HostPage } from "./pages/HostPage";
import { GuestPage } from "./pages/GuestPage";
import { ScreenPage } from "./pages/ScreenPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host/:eventId" element={<HostPage />} />
        <Route path="/join/:eventId" element={<GuestPage />} />
        <Route path="/screen/:eventId" element={<ScreenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
