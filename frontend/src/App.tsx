import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import AdminLogin from './pages/public/AdminLogin';
import Register from './pages/public/Register';

// Admin Pages
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import AdminDatasets from './pages/admin/AdminDatasets';
import AuditLogs from './pages/admin/AuditLogs';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminSettings from './pages/admin/AdminSettings';
import AdminGuard from './components/guards/AdminGuard';

import DatasetList from './pages/user/DatasetList';
import FileUpload from './pages/user/FileUpload';
import ChatInterface from './pages/user/ChatInterface';

import DataCleaning from './pages/user/DataCleaning';
import ConnectDatabase from './pages/user/ConnectDatabase';
import Downloads from './pages/user/Downloads';
import UserProfile from './pages/user/UserProfile';
import CanvasPage from './pages/user/CanvasPage';

// User Pages
import UserLayout from './components/layout/UserLayout';
import UserDashboard from './pages/user/UserDashboard';

import { ThemeProvider } from './context/ThemeContext';

function App() {
    const queryClient = new QueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <BrowserRouter>
                    <Toaster
                        position="bottom-right"
                        toastOptions={{
                            style: {
                                background: '#1a1a2e',
                                color: '#e2e8f0',
                                border: '1px solid rgba(255,255,255,0.06)',
                                fontSize: '13px',
                                borderRadius: '10px',
                                padding: '12px 16px',
                            },
                            iconTheme: {
                                primary: '#7c3aed',
                                secondary: '#e2e8f0',
                            },
                        }}
                    />
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/" element={<Landing />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/admin/login" element={<AdminLogin />} />
                        <Route path="/register" element={<Register />} />

                        {/* User Routes */}
                        <Route path="/user" element={<UserLayout />}>
                            <Route path="dashboard" element={<UserDashboard />} />
                            <Route path="datasets" element={<DatasetList />} />
                            <Route path="upload" element={<FileUpload />} />
                            <Route path="chat" element={<ChatInterface />} />
                            <Route path="cleaning" element={<DataCleaning />} />
                            <Route path="connect-db" element={<ConnectDatabase />} />
                            <Route path="downloads" element={<Downloads />} />
                            <Route path="profile" element={<UserProfile />} />
                            <Route path="canvas" element={<CanvasPage />} />
                        </Route>

                        {/* Admin Routes (Protected) */}
                        <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
                            <Route index element={<AdminDashboard />} />
                            <Route path="users" element={<UserManagement />} />
                            <Route path="datasets" element={<AdminDatasets />} />
                            <Route path="analytics" element={<AdminAnalytics />} />
                            <Route path="audit" element={<AuditLogs />} />
                            <Route path="settings" element={<AdminSettings />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;
