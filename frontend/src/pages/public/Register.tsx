import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '../../lib/api/auth';
import ThemeToggle from '../../components/ui/ThemeToggle'; 

export default function Register() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    
    // Form state
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!firstName || !lastName || !email) {
            setError('Please complete all personal details.');
            return;
        }
        setStep(2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            await authApi.register({
                name: `${firstName} ${lastName}`.trim(),
                email: email,
                password: password,
            });
            navigate('/login');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const passwordStrength = password.length >= 12 ? 'strong' : password.length >= 8 ? 'medium' : 'weak';

    if (step === 1) {
        return (
            <div className="bg-background font-body text-on-surface min-h-screen flex flex-col items-center justify-center p-4 relative overflow-x-hidden">
                <div className="fixed top-6 right-6 z-50">
                    <ThemeToggle />
                </div>
                {/* Main Container */}
                <main className="w-full max-w-6xl aspect-[16/9] bg-surface-container-lowest rounded-xl overflow-hidden flex flex-col md:flex-row ambient-shadow border border-outline-variant/20 my-auto">
                    {/* Left Panel: Branding & Welcome */}
                    <section className="hidden md:flex w-full md:w-5/12 bg-surface-container-low p-8 md:p-12 flex-col justify-between">
                        <div className="space-y-8">
                            {/* Brand Logo */}
                            <div className="flex items-center gap-2">
                                <Link to="/" className="text-2xl font-bold font-headline text-primary tracking-tight hover:opacity-80 transition-opacity">Vizzy AI</Link>
                            </div>
                            <div className="space-y-4">
                                <h1 className="text-3xl md:text-4xl font-headline font-bold text-on-surface leading-tight">Create your Vizzy Account</h1>
                                <p className="text-on-surface-variant text-lg leading-relaxed">
                                    One account gives you access to the world's most intuitive data curation platform.
                                </p>
                            </div>
                        </div>
                        {/* Illustration/Visual Asset */}
                        <div className="relative mt-12 mb-8">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-surface-container-lowest p-4 rounded-xl ambient-shadow flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary" data-icon="hub">hub</span>
                                    <span className="text-xs font-semibold font-label uppercase tracking-widest text-on-surface-variant">Centralized</span>
                                </div>
                                <div className="bg-surface-container-lowest p-4 rounded-xl ambient-shadow flex items-center gap-3 translate-y-4">
                                    <span className="material-symbols-outlined text-secondary" data-icon="auto_awesome">auto_awesome</span>
                                    <span className="text-xs font-semibold font-label uppercase tracking-widest text-on-surface-variant">Automated</span>
                                </div>
                                <div className="bg-surface-container-lowest p-4 rounded-xl ambient-shadow flex items-center gap-3 -translate-y-2">
                                    <span className="material-symbols-outlined text-tertiary-container" data-icon="security">security</span>
                                    <span className="text-xs font-semibold font-label uppercase tracking-widest text-on-surface-variant">Secure</span>
                                </div>
                                <div className="bg-surface-container-lowest p-4 rounded-xl ambient-shadow flex items-center gap-3 translate-y-2">
                                    <span className="material-symbols-outlined text-primary-fixed-dim" data-icon="query_stats">query_stats</span>
                                    <span className="text-xs font-semibold font-label uppercase tracking-widest text-on-surface-variant">Insightful</span>
                                </div>
                            </div>
                            <div className="absolute -z-10 top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent"></div>
                        </div>
                        <div className="text-on-surface-variant/60 text-sm">
                            Preferred by 200+ global enterprises.
                        </div>
                    </section>
                    
                    {/* Right Panel: Sign Up Form */}
                    <section className="w-full md:w-7/12 bg-surface-container-lowest p-8 md:px-20 md:py-16 flex flex-col justify-center">
                        <div className="max-w-md mx-auto w-full">
                            {/* Mobile Logo */}
                            <div className="md:hidden flex items-center gap-2 mb-8">
                                <Link to="/" className="text-2xl font-bold font-headline text-primary tracking-tight">Vizzy AI</Link>
                            </div>
                            
                            {/* Step Indicator */}
                            <div className="flex items-center gap-2 mb-8">
                                <div className="h-1 flex-1 bg-primary rounded-full"></div>
                                <div className="h-1 flex-1 bg-surface-container-high rounded-full"></div>
                            </div>
                            
                            <div className="mb-10">
                                <h2 className="text-sm font-label font-bold text-primary uppercase tracking-widest mb-2">Step 1: Personal Details</h2>
                                <p className="text-on-surface-variant text-base">Let's start with your basic information to get your workspace ready.</p>
                            </div>
                            
                            {error && (
                                <div className="mb-6 p-4 border border-error/30 bg-error-container rounded text-on-error-container text-xs font-label uppercase tracking-widest text-center">
                                    {error}
                                </div>
                            )}

                            <form className="space-y-6" onSubmit={handleNextStep}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label htmlFor="first_name" className="text-xs font-semibold font-label text-on-surface-variant ml-1">First Name</label>
                                        <input 
                                            type="text" 
                                            id="first_name" 
                                            placeholder="Jane" 
                                            required
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-lg border-0 bg-surface-container-low text-on-surface placeholder-on-surface-variant/40 focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="last_name" className="text-xs font-semibold font-label text-on-surface-variant ml-1">Last Name</label>
                                        <input 
                                            type="text" 
                                            id="last_name" 
                                            placeholder="Doe" 
                                            required
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            className="w-full px-4 py-3 rounded-lg border-0 bg-surface-container-low text-on-surface placeholder-on-surface-variant/40 focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="work_email" className="text-xs font-semibold font-label text-on-surface-variant ml-1">Work Email</label>
                                    <div className="relative">
                                        <input 
                                            type="email" 
                                            id="work_email" 
                                            placeholder="jane.doe@company.com" 
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 rounded-lg border-0 bg-surface-container-low text-on-surface placeholder-on-surface-variant/40 focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all" 
                                        />
                                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60">mail</span>
                                    </div>
                                </div>
                                <div className="pt-4 flex flex-col gap-4">
                                    <button type="submit" className="w-full py-4 bg-gradient-to-b from-primary-container to-primary bg-primary text-on-primary font-headline font-bold rounded-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group">
                                        Next
                                        <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                    </button>
                                    <div className="flex items-center justify-center gap-2 text-sm">
                                        <span className="text-on-surface-variant">Already have an account?</span>
                                        <Link to="/login" className="text-primary font-semibold hover:underline decoration-2 underline-offset-4">Sign in instead</Link>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </section>
                </main>
                
                {/* Footer Component */}
                <footer className="w-full max-w-6xl mx-auto flex justify-between items-center px-12 py-6 bg-transparent mt-4 opacity-70">
                    <div className="text-xs font-['Inter'] tracking-wide text-on-surface-variant">
                        © 2024 Alabaster Systems Inc.
                    </div>
                    <div className="flex gap-6">
                        <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Privacy</a>
                        <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Terms</a>
                        <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Help</a>
                    </div>
                </footer>
            </div>
        );
    }
    
    /* STEP 2 PASSWORD COMPONENT */
    return (
        <div className="bg-background font-body text-on-surface min-h-screen flex items-center justify-center p-4 md:p-6 lg:p-8 antialiased relative">
            <div className="fixed top-6 right-6 z-50">
                <ThemeToggle />
            </div>
            {/* Auth Container */}
            <main className="w-full max-w-6xl bg-surface-container-lowest rounded-xl overflow-hidden flex shadow-2xl min-h-[640px] my-auto relative">
                {/* Left Panel: Brand Messaging & Checklist */}
                <section className="hidden lg:flex w-5/12 bg-surface-container-low p-12 flex-col justify-between relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #c7c4d8 1px, transparent 0)", backgroundSize: "32px 32px" }}></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-12">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-on-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                            </div>
                            <Link to="/">
                                <span className="font-headline font-bold text-xl tracking-tight text-on-surface hover:opacity-80 transition-opacity">Vizzy AI</span>
                            </Link>
                        </div>
                        <h1 className="font-headline text-4xl font-bold text-on-surface leading-tight mb-6">
                            Unlock the power of <span className="text-primary">Intelligence</span>.
                        </h1>
                        <p className="text-on-surface-variant text-lg mb-10 leading-relaxed">
                            Setting up your account takes less than a minute. Join 10,000+ teams automating their workflows.
                        </p>
                        
                        {/* Checklist */}
                        <ul className="space-y-6">
                            <li className="flex items-start gap-4">
                                <div className="mt-1 w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-on-secondary-fixed-variant text-sm" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                </div>
                                <div>
                                    <h3 className="font-headline font-semibold text-on-surface">Secure access</h3>
                                    <p className="text-on-surface-variant text-sm">Enterprise-grade encryption for all your data and projects.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-4">
                                <div className="mt-1 w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-on-secondary-fixed-variant text-sm" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                </div>
                                <div>
                                    <h3 className="font-headline font-semibold text-on-surface">Collaboration</h3>
                                    <p className="text-on-surface-variant text-sm">Invite your team and work together in real-time environments.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-4">
                                <div className="mt-1 w-6 h-6 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-on-secondary-fixed-variant text-sm" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                                </div>
                                <div>
                                    <h3 className="font-headline font-semibold text-on-surface">Real-time data</h3>
                                    <p className="text-on-surface-variant text-sm">Instant insights and live dashboard updates across platforms.</p>
                                </div>
                            </li>
                        </ul>
                    </div>
                </section>
                
                {/* Right Panel: Password Creation Form */}
                <section className="w-full lg:w-7/12 p-8 md:p-16 lg:p-24 flex flex-col justify-center">
                    <div className="max-w-md mx-auto w-full">
                        <div className="lg:hidden flex items-center gap-2 mb-8">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <span className="material-symbols-outlined text-on-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                            </div>
                            <Link to="/">
                                <span className="font-headline font-bold text-xl tracking-tight text-on-surface">Vizzy AI</span>
                            </Link>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-8">
                            <div className="h-1 flex-1 bg-surface-container-high rounded-full"></div>
                            <div className="h-1 flex-1 bg-primary rounded-full"></div>
                        </div>
                        
                        <div className="mb-10">
                            <h2 className="font-headline text-3xl font-bold text-on-surface mb-2">Step 2: Create a Password</h2>
                            <p className="text-on-surface-variant">Secure your account with a strong password.</p>
                        </div>
                        
                        {/* Email Pill (Read Only) */}
                        <div className="flex items-center gap-3 bg-surface-container-low px-4 py-2 rounded-full w-fit mb-8 group border border-transparent hover:border-outline-variant transition-all cursor-pointer" onClick={() => setStep(1)}>
                            <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>account_circle</span>
                            <span className="text-sm font-medium text-on-surface-variant">{email}</span>
                            <button className="text-primary hover:text-on-primary-fixed-variant ml-1 transition-colors" type="button">
                                <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                        </div>
                        
                        {error && (
                            <div className="mb-6 p-4 border border-error/30 bg-error-container rounded text-on-error-container text-xs font-label uppercase tracking-widest text-center">
                                {error}
                            </div>
                        )}

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            {/* Password Field */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center px-1">
                                    <label htmlFor="password" className="block text-sm font-semibold text-on-surface">Password</label>
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:underline outline-none"
                                    >
                                        <span className="material-symbols-outlined text-sm">
                                            {showPassword ? 'visibility_off' : 'visibility'}
                                        </span>
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <div className="relative">
                                    <input 
                                        type={showPassword ? 'text' : 'password'}
                                        id="password" 
                                        name="password" 
                                        placeholder="Min. 8 characters" 
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none" 
                                    />
                                </div>
                                {/* Strength Indicator */}
                                {password && (
                                    <div className="pt-2">
                                        <div className="flex gap-1 h-1 mb-2">
                                            <div className={`flex-1 rounded-full ${passwordStrength === 'weak' ? 'bg-error' : passwordStrength === 'medium' ? 'bg-[#facc15]' : 'bg-secondary'}`}></div>
                                            <div className={`flex-1 rounded-full ${passwordStrength === 'medium' || passwordStrength === 'strong' ? (passwordStrength === 'medium' ? 'bg-[#facc15]' : 'bg-secondary') : 'bg-outline-variant/30'}`}></div>
                                            <div className={`flex-1 rounded-full ${passwordStrength === 'strong' ? 'bg-secondary' : 'bg-outline-variant/30'}`}></div>
                                            <div className={`flex-1 rounded-full ${passwordStrength === 'strong' ? 'bg-secondary' : 'bg-outline-variant/30'}`}></div>
                                        </div>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest ${passwordStrength === 'weak' ? 'text-error' : passwordStrength === 'medium' ? 'text-[#facc15]' : 'text-secondary'}`}>
                                            {passwordStrength} Password
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Confirm Password Field */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center px-1">
                                    <label htmlFor="confirm-password" className="block text-sm font-semibold text-on-surface">Confirm Password</label>
                                    <button 
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="text-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:underline outline-none"
                                    >
                                        <span className="material-symbols-outlined text-sm">
                                            {showConfirmPassword ? 'visibility_off' : 'visibility'}
                                        </span>
                                        {showConfirmPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <input 
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    id="confirm-password" 
                                    name="confirm-password" 
                                    placeholder="Repeat your password" 
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`w-full px-4 py-3 bg-surface-container-lowest border rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none ${confirmPassword && password !== confirmPassword ? 'border-error' : 'border-outline-variant'}`} 
                                />
                            </div>
                            
                            {/* CTA */}
                            <div className="pt-4">
                                <button 
                                    type="submit" 
                                    disabled={isLoading || password !== confirmPassword || password.length === 0 || !agreeToTerms}
                                    className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                                >
                                    {isLoading ? 'Creating Account...' : 'Create Account'}
                                    {!isLoading && <span className="material-symbols-outlined">arrow_forward</span>}
                                </button>
                            </div>
                        </form>
                        
                        <div className="mt-8 text-center flex items-center justify-center gap-2">
                            <input 
                                type="checkbox" 
                                id="terms" 
                                required
                                checked={agreeToTerms}
                                onChange={(e) => setAgreeToTerms(e.target.checked)}
                                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" 
                            />
                            <p className="text-sm text-on-surface-variant">
                                By creating an account, you agree to our <a href="#" className="text-primary font-medium hover:underline">Terms</a> and <a href="#" className="text-primary font-medium hover:underline">Privacy Policy</a>.
                            </p>
                        </div>
                    </div>
                </section>
            </main>
            <footer className="w-full max-w-6xl mx-auto flex justify-between items-center px-12 py-6 bg-transparent mt-4 opacity-70">
                <div className="text-xs font-['Inter'] tracking-wide text-on-surface-variant">
                    © 2024 Alabaster Systems Inc.
                </div>
                <div className="flex gap-6">
                    <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Privacy</a>
                    <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Terms</a>
                    <a href="#" className="text-xs font-['Inter'] tracking-wide text-on-surface-variant hover:text-primary underline-offset-4 hover:underline transition-all duration-200">Help</a>
                </div>
            </footer>
        </div>
    );
}
