import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header  from "./components/Header";
import Dashboard  from "./pages/Dashboard";
import Visitors   from "./pages/Visitors";
import Campaigns  from "./pages/Campaigns";
import Templates  from "./pages/Templates";
import CartEvents from "./pages/CartEvents";
import Contacts   from "./pages/Contacts";
import Analytics  from "./pages/Analytics";
import Settings   from "./pages/Settings";
import Chat       from "./pages/Chat";
import Gallery    from "./pages/Gallery";

function PageWrapper({ children }) {
  return (
    <div className="page-enter h-full">
      {children}
    </div>
  );
}

function AppLayout({ sidebarOpen, setSidebarOpen }) {
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080d17' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />

        <main
          key={location.pathname}
          className={`flex-1 min-w-0 ${isChat ? 'overflow-hidden' : 'overflow-y-auto'}`}
          style={isChat ? {} : { padding: '24px 28px' }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"   element={<PageWrapper><Dashboard/></PageWrapper>} />
            <Route path="/visitors"    element={<PageWrapper><Visitors/></PageWrapper>} />
            <Route path="/campaigns"   element={<PageWrapper><Campaigns/></PageWrapper>} />
            <Route path="/templates"   element={<PageWrapper><Templates/></PageWrapper>} />
            <Route path="/cart-events" element={<PageWrapper><CartEvents/></PageWrapper>} />
            <Route path="/contacts"    element={<PageWrapper><Contacts/></PageWrapper>} />
            <Route path="/analytics"   element={<PageWrapper><Analytics/></PageWrapper>} />
            <Route path="/settings"    element={<PageWrapper><Settings/></PageWrapper>} />
            <Route path="/chat"        element={<Chat/>} />
            <Route path="/gallery"     element={<PageWrapper><Gallery/></PageWrapper>} />
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
