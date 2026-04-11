import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Visitors from "./pages/Visitors";
import Campaigns from "./pages/Campaigns";
import Templates from "./pages/Templates";
import CartEvents from "./pages/CartEvents";
import Contacts from "./pages/Contacts";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Chat from "./pages/Chat";

// Separate component so useLocation works inside BrowserRouter
function AppLayout({ sidebarOpen, setSidebarOpen }) {
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0f1a]">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className={`flex-1 ${isChat ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/visitors" element={<Visitors />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/cart-events" element={<CartEvents />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <BrowserRouter>
      <AppLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
    </BrowserRouter>
  );
}
