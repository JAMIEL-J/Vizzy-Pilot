import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '../../lib/api/auth';
import ThemeToggle from '../../components/ui/ThemeToggle'; 

export default function Login() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email) {
            setError('Please enter your email.');
            return;
        }
        setStep(2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.loginUser({ email, password });
            localStorage.setItem('access_token', response.access_token);
            localStorage.setItem('refresh_token', response.refresh_token);
            navigate('/user/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (step === 1) {
        return (
            <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col relative overflow-x-hidden">
                <div className="fixed top-6 right-6 z-50">
                    <ThemeToggle />
                </div>
                <main className="flex-grow flex items-center justify-center px-6 py-12 relative z-10">
                    <div className="w-full max-w-[1024px] bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex flex-col md:flex-row overflow-hidden shadow-sm relative">
                        {/* Admin Link */}
                        <div className="absolute top-6 right-6 z-20">
                            <Link to="/admin/login" className="text-xs font-label uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-1 text-on-surface-variant/70">
                                <span className="material-symbols-outlined text-[1rem]">admin_panel_settings</span>
                                Admin
                            </Link>
                        </div>
                        {/* Left Side */}
                        <div className="hidden md:flex flex-col justify-between w-1/2 p-12 bg-surface-container-low border-r border-outline-variant/10">
                            <div className="flex flex-col">
                                <Link to="/">
                                    <span className="font-headline text-3xl font-extrabold text-primary tracking-tight mb-12 block hover:opacity-80 transition-opacity">Vizzy</span>
                                </Link>
                                <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight mb-4">One account. All of Vizzy working for you.</h2>
                                <p className="text-on-surface-variant text-lg font-medium max-w-sm">Sign in to continue to your workspace, tools, and personalized settings.</p>
                            </div>
                            <div className="flex items-center space-x-4 opacity-40 grayscale group hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary">security</span>
                                </div>
                                <p className="text-sm font-medium text-on-surface-variant">Built with Alabaster & Slate security standards.</p>
                            </div>
                        </div>
                        {/* Right Side */}
                        <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
                            <div className="md:hidden mb-10 text-center">
                                <Link to="/">
                                    <span className="font-headline text-3xl font-extrabold text-primary tracking-tight hover:opacity-80 transition-opacity">Vizzy</span>
                                </Link>
                            </div>
                            <div className="mb-10">
                                <h1 className="font-headline text-2xl font-bold text-on-surface mb-2">Sign in</h1>
                                <p className="text-on-surface-variant font-medium">Use your Vizzy Account</p>
                            </div>
                            {error && (
                                <div className="mb-6 p-4 border border-error/30 bg-error-container rounded text-on-error-container text-xs font-label uppercase tracking-widest text-center">
                                    {error}
                                </div>
                            )}
                            <form className="flex-grow flex flex-col" onSubmit={handleNextStep}>
                                <div className="space-y-6 mb-8">
                                    <div className="relative floating-input group">
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-4 py-4 rounded-lg bg-transparent border border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-on-surface" 
                                            id="identifier" 
                                            placeholder=" " 
                                        />
                                        <label htmlFor="identifier" className="absolute left-4 top-4 text-on-surface-variant pointer-events-none transition-all duration-200 origin-left">
                                            Email or phone
                                        </label>
                                    </div>
                                    <div className="flex flex-col">
                                        <button type="button" className="text-primary font-bold text-sm text-left hover:text-primary-container transition-colors w-fit">
                                            Forgot email?
                                        </button>
                                    </div>
                                    <div className="text-sm text-on-surface-variant leading-relaxed">
                                        Not your computer? Use Guest mode to sign in privately. 
                                        <a href="#" className="text-primary font-bold hover:underline ml-1">Learn more</a>
                                    </div>
                                </div>
                                <div className="mt-auto flex items-center justify-between pt-6">
                                    <div className="flex gap-2">
                                        <Link to="/register" className="text-primary font-bold text-sm px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors">
                                            Create account
                                        </Link>
                                    </div>
                                    <button type="submit" className="bg-primary text-on-primary font-bold px-8 py-2.5 rounded-lg hover:bg-primary-container transition-all active:scale-95 shadow-sm">
                                        Next
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-center space-x-6 py-8 w-full max-w-[1024px] mx-auto bg-transparent relative z-10">
                    <div className="flex items-center space-x-6">
                        <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Privacy</a>
                        <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Terms</a>
                        <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Help</a>
                    </div>
                </footer>
                <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-surface-container-low rounded-full blur-[120px] opacity-50"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-primary-fixed-dim/20 rounded-full blur-[100px] opacity-30"></div>
                </div>
            </div>
        );
    }

    /* STEP 2 PASSWORD COMPONENT */
    return (
        <div className="bg-background font-body text-on-surface min-h-screen flex flex-col relative overflow-x-hidden">
            <div className="fixed top-6 right-6 z-50">
                <ThemeToggle />
            </div>
            <div className="flex-grow flex items-center justify-center px-6 py-12 relative z-10">
                <main className="w-full max-w-[1024px] bg-surface-container-lowest rounded-2xl border border-outline-variant/30 flex flex-col md:flex-row overflow-hidden shadow-sm relative">
                    {/* Left Half: Editorial / Brand Context */}
                    <section className="hidden md:flex flex-col justify-between w-1/2 bg-surface-container-low p-12 border-r border-outline-variant/10 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #c7c4d8 1px, transparent 0)", backgroundSize: "32px 32px" }}></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-20">
                                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
                                </div>
                                <Link to="/">
                                    <span className="font-headline text-3xl font-extrabold text-primary tracking-tight hover:opacity-80 transition-opacity">Vizzy</span>
                                </Link>
                            </div>
                            <div className="max-w-md">
                                <h1 className="font-headline text-4xl font-bold text-on-surface leading-tight mb-6">
                                    Welcome back
                                </h1>
                                <p className="text-on-surface-variant text-lg leading-relaxed">
                                    Enter your password to continue to your workspace. Your curated data insights are waiting for you.
                                </p>
                            </div>
                        </div>
                        <div className="relative z-10 flex items-center gap-3">
                            <div className="px-3 py-1.5 bg-surface-container-lowest rounded-full flex items-center gap-2 border border-outline-variant/20 shadow-sm">
                                <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                                <span className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Built with Alabaster & Slate security standards</span>
                            </div>
                        </div>
                    </section>
                    
                    {/* Right Half: Functional Input */}
                    <section className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center relative">
                        <div className="absolute top-6 right-6 z-20">
                            <Link to="/admin/login" className="text-xs font-label uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-1 text-on-surface-variant/70">
                                <span className="material-symbols-outlined text-[1rem]">admin_panel_settings</span>
                                Admin
                            </Link>
                        </div>
                        <div className="w-full max-w-sm mx-auto">
                            <div className="md:hidden flex flex-col items-center mb-10">
                                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
                                </div>
                                <h1 className="font-headline text-2xl font-bold text-center">Welcome back</h1>
                            </div>
                            
                            <div className="mb-8 group">
                                <div className="flex items-center justify-between p-3 rounded-lg border border-outline-variant/30 bg-surface-container-low/50 hover:bg-surface-container-low transition-colors cursor-pointer" onClick={() => setStep(1)}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold text-xs uppercase">
                                            {email.charAt(0) || 'U'}
                                        </div>
                                        <span className="text-sm font-medium text-on-surface">{email}</span>
                                    </div>
                                    <span className="material-symbols-outlined text-on-surface-variant text-sm">edit</span>
                                </div>
                            </div>
                            
                            {error && (
                                <div className="mb-6 p-4 border border-error/30 bg-error-container rounded text-on-error-container text-xs font-label uppercase tracking-widest text-center">
                                    {error}
                                </div>
                            )}

                            <form className="space-y-6" onSubmit={handleSubmit}>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label htmlFor="password" className="block font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">
                                            Password
                                        </label>
                                        <button 
                                            className="text-primary text-xs font-semibold flex items-center gap-1 hover:underline" 
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            <span className="material-symbols-outlined text-base">
                                                {showPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                            {showPassword ? 'Hide password' : 'Show password'}
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <input 
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-4 py-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant/30 focus:ring-2 focus:ring-primary focus:bg-white transition-all outline-none" 
                                            id="password" 
                                            placeholder="••••••••" 
                                        />
                                    </div>
                                    <div className="flex justify-between items-center px-1 pt-2">
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox" id="remember" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                                            <label htmlFor="remember" className="text-sm text-on-surface-variant">Stay signed in</label>
                                        </div>
                                        <a href="#" className="text-sm font-medium text-primary hover:underline">Forgot password?</a>
                                    </div>
                                </div>
                                <div className="pt-8 flex flex-col items-center gap-6">
                                    <button 
                                        type="submit" 
                                        disabled={isLoading}
                                        className="w-full bg-primary text-on-primary py-4 rounded-xl font-headline font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/25 disabled:opacity-70 disabled:pointer-events-none"
                                    >
                                        {isLoading ? 'Loading...' : 'Sign in'}
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 group"
                                    >
                                        <span className="material-symbols-outlined text-lg transition-transform group-hover:-translate-x-1">arrow_back</span>
                                        Try another way
                                    </button>
                                </div>
                            </form>
                            <div className="md:hidden mt-20 text-center">
                                <span className="font-label text-[10px] font-semibold uppercase tracking-wider text-outline-variant">Vizzy Security Stack</span>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
            
            <footer className="w-full max-w-[1024px] mx-auto flex justify-center space-x-6 py-8 relative z-10">
                <span className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">© 2024 Alabaster & Slate. All rights reserved.</span>
                <div className="flex space-x-6">
                    <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Privacy</a>
                    <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Terms</a>
                    <a href="#" className="font-label text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-all">Help</a>
                </div>
            </footer>
        </div>
    );
}
