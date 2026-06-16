import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import ThemeToggle from '../../components/ui/ThemeToggle';

// --- Sub-components ---

const LandingNavbar = () => (
  <nav className="fixed top-0 w-full z-50 border-b border-border-subtle/20 bg-alabaster/70 backdrop-blur-xl">
    <div className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-2xl font-bold tracking-tight font-headline">
        <span className="w-8 h-8 bg-indigo-accent rounded-lg flex items-center justify-center text-white text-base">V</span>
        <span className="text-slate-custom">Vizzy Pilot</span>
      </div>
      <div className="hidden md:flex items-center space-x-10">
        <a className="text-sm font-medium text-slate-custom hover:text-indigo-accent transition-colors" href="#features">Capabilities</a>
        <a className="text-sm font-medium text-slate-custom hover:text-indigo-accent transition-colors" href="#deep-dive">Intelligence</a>
        <a className="text-sm font-medium text-slate-custom hover:text-indigo-accent transition-colors" href="#pricing">Pricing</a>
      </div>
      <div className="flex items-center gap-6">
        <ThemeToggle size="sm" />
        <Link to="/login" className="text-sm font-semibold text-slate-custom hover:text-indigo-accent transition-colors">Log in</Link>
        <Link to="/register" className="px-6 py-2.5 bg-indigo-accent text-white rounded-full font-semibold hover:bg-indigo-accent/80 transition-all duration-300 shadow-lg shadow-indigo-500/20">
          Get Started
        </Link>
      </div>
    </div>
  </nav>
);

const LandingHero = () => (
  <section className="relative pt-40 pb-24 overflow-hidden">
    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-accent/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4"></div>
    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-accent/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4"></div>
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="max-w-4xl mx-auto px-8 relative z-10 text-center"
    >
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-accent/10 border border-indigo-accent/20 text-indigo-accent text-xs font-bold uppercase tracking-widest font-body mb-8">
        <span className="w-2 h-2 rounded-full bg-indigo-accent animate-pulse"></span>
        Enterprise LLM Orchestration
      </div>
      <h1 className="text-5xl md:text-7xl font-headline font-bold text-slate-custom leading-[1.1] tracking-tight mb-8">
        Transform Raw Data into <span className="text-gradient">Actionable Intelligence</span> with Conversational AI.
      </h1>
      <p className="text-xl text-slate-custom/70 max-w-2xl mx-auto leading-relaxed mb-10">
        Advanced LLM Orchestration meets deterministic computing. Query, visualize, and govern your enterprise data with natural language precision.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-5">
        <Link to="/register" className="px-10 py-4 bg-indigo-accent text-white rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-xl shadow-indigo-600/20 group flex items-center justify-center">
          Get Started for free
          <span className="material-symbols-outlined align-middle ml-2 group-hover:translate-x-1 transition-transform">bolt</span>
        </Link>
        <button className="px-10 py-4 bg-alabaster border border-border-subtle/20 text-slate-custom rounded-2xl font-bold text-lg hover:bg-indigo-accent/10 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-slate-custom/50">play_circle</span>
          Technical Demo
        </button>
      </div>
    </motion.div>
  </section>
);

const LandingCapabilities = () => (
  <section className="py-24 bg-alabaster" id="features">
    <div className="max-w-7xl mx-auto px-8">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-20"
      >
        <h2 className="text-4xl md:text-5xl font-headline font-bold text-slate-custom mb-6 antialiased">Built for Deterministic Speed</h2>
        <p className="text-lg text-slate-custom/60 max-w-2xl mx-auto">Powered by DuckDB and Pandas for sub-500ms execution on billion-row datasets.</p>
      </motion.div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { icon: 'chat_bubble', title: 'Plain English Analytics', text: 'Query your data as naturally as asking a colleague. No SQL, no friction.', color: 'indigo-accent' },
          { icon: 'verified', title: 'Deterministic Accuracy', text: 'DuckDB-powered verification ensures LLM responses match exact tabular logic.', color: 'emerald-accent' },
          { icon: 'auto_awesome', title: 'Smart Auto-Visuals', text: 'Instant, context-aware charts generated automatically based on your query intent.', color: 'indigo-accent' },
          { icon: 'gavel', title: 'Data Governance', text: 'Enterprise-grade RBAC, JWT security, and immutable audit trails for every query.', color: 'emerald-accent' },
        ].map((feat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className={`p-8 bg-alabaster/40 rounded-3xl border border-border-subtle/40 hover:border-indigo-accent transition-all group`}
          >
            <span className={`material-symbols-outlined text-indigo-accent text-4xl mb-6 block group-hover:scale-110 transition-transform`}>{feat.icon}</span>
            <h3 className="text-xl font-bold font-headline text-slate-custom mb-3">{feat.title}</h3>
            <p className="text-slate-custom/70 text-sm">{feat.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const LandingDeepDive = () => (
  <section className="py-32 bg-alabaster relative overflow-hidden" id="deep-dive">
    <div className="max-w-7xl mx-auto px-8">
      {/* 01: Ingestion */}
      <div className="grid md:grid-cols-2 gap-24 items-center mb-40">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute -top-12 -left-12 text-[10rem] font-headline font-bold text-slate-custom/5 leading-none -z-10 select-none">01</div>
          <div className="space-y-6">
            <span className="inline-block text-indigo-accent font-bold tracking-widest text-sm uppercase">Engine Layer</span>
            <h3 className="text-4xl font-headline font-bold text-slate-custom leading-tight">Smart Ingestion <br/> &amp; Schema Inference.</h3>
            <p className="text-lg text-slate-custom/70 leading-relaxed">
              Native support for CSV, Parquet, and JSON. Our engine automatically infers schema relationships while maintaining immutable versioning for every dataset.
            </p>
            <div className="flex gap-4 pt-4 text-slate-custom">
               <span className="px-3 py-1 bg-alabaster border border-border-subtle rounded-lg text-xs font-mono font-bold text-slate-custom/50">.parquet</span>
               <span className="px-3 py-1 bg-alabaster border border-border-subtle rounded-lg text-xs font-mono font-bold text-slate-custom/50">.csv</span>
               <span className="px-3 py-1 bg-alabaster border border-border-subtle rounded-lg text-xs font-mono font-bold text-slate-custom/50">.json</span>
            </div>
          </div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="relative glass-card p-2 rounded-[2.5rem] border border-border-subtle shadow-xl overflow-hidden"
        >
          <img alt="Data Ingestion" className="w-full h-auto rounded-[2rem]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDsMtThly01-Y7qh3i9IfqrN4q-UKfgTMUGThSD3qbIyMKtb_RGnJAavRE7_faZPlcLbc4cvatb9HVE6Go8OBjHeIk_H6NfabSbbMJkyYo_N2Qtzyg7cKDOujLjfBEHIqjka7GyXLUk0SP8_N5u09cAzzWMdiHq1ePxbSm9iRkqjfM2AwQu3JjBo5VZUOMVi94igoNE9Dnjh2lXxhS2nVROUnZ5KtC2oowTTP5bm2W6VfVG5CcsF5PbzBGb8w4dr273si0PQpC6EOh_" />
        </motion.div>
      </div>

      {/* 02: Cleaning */}
      <div className="grid md:grid-cols-2 gap-24 items-center mb-40">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="order-2 md:order-1 relative glass-card p-2 rounded-[2.5rem] border border-border-subtle shadow-xl overflow-hidden"
        >
          <img alt="Cleaning Studio" className="w-full h-auto rounded-[2rem]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7gGEXAwstteRgooInzriLCEypP3VrZKHAsF2BGL04urWZucifmNQgCikGNMLGojPu9GiWneSf0gBKIMYfscClkJMnfCLuE_heUovW5-y-eirx1GUawLL5TGo86huZp8BG9NrmssXdS9MRRlCIqKzz3-2QJubNwculcaQtAnvthbQ0t3fbWTqNcdwHaDr4Un8VF9UVslhgsLcdmPXLqHgQKFr_C95rMCkHxdYlihBLdq4i_EhqrP1O9vjwZZnTr8UEmj-DuhQFqQoK" />
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="order-1 md:order-2 relative"
        >
          <div className="absolute -top-12 -left-12 text-[10rem] font-headline font-bold text-slate-custom/5 leading-none -z-10 select-none">02</div>
          <div className="space-y-6">
            <span className="inline-block text-emerald-accent font-bold tracking-widest text-sm uppercase">Data Cleaning Studio 2.0</span>
            <h3 className="text-4xl font-headline font-bold text-slate-custom leading-tight">Automated Profiling. <br/> Intelligent Remediation.</h3>
            <p className="text-lg text-slate-custom/70 leading-relaxed">
              Identify data quality issues instantly. Our visual penalty breakdown highlights anomalies, missing values, and type mismatches with one-click healing.
            </p>
            <ul className="space-y-3 pt-2">
              <li className="flex items-center gap-2 text-sm font-semibold text-slate-custom/80">
                <span className="material-symbols-outlined text-emerald-accent text-lg">check_circle</span>
                Intelligent Outlier Removal
              </li>
              <li className="flex items-center gap-2 text-sm font-semibold text-slate-custom/80">
                <span className="material-symbols-outlined text-emerald-accent text-lg">check_circle</span>
                Semantic Type Alignment
              </li>
            </ul>
          </div>
        </motion.div>
      </div>

      {/* 03: AI Core */}
      <div className="grid md:grid-cols-2 gap-24 items-center mb-40">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute -top-12 -left-12 text-[10rem] font-headline font-bold text-slate-custom/5 leading-none -z-10 select-none">03</div>
          <div className="space-y-6">
            <span className="inline-block text-indigo-accent font-bold tracking-widest text-sm uppercase">AI Core</span>
            <h3 className="text-4xl font-headline font-bold text-slate-custom leading-tight">Multi-LLM Gateway <br/> with Context Memory.</h3>
            <p className="text-lg text-slate-custom/70 leading-relaxed">
              Orchestrate between AI Models powered by Groq. Our context-aware memory system remembers previous query steps to allow deep, iterative data exploration.
            </p>
            <div className="flex flex-wrap gap-2 pt-4">
              {['Groq 70B', 'Gemini Pro', 'Llama-3'].map((llm, i) => (
                <div key={i} className="px-4 py-2 bg-indigo-accent/5 border border-indigo-accent/20 rounded-xl flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-accent"></div>
                  <span className="text-xs font-bold text-indigo-accent">{llm}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative glass-card p-2 rounded-[2.5rem] border border-border-subtle shadow-xl overflow-hidden"
        >
          <img alt="AI Engine" className="w-full h-auto rounded-[2rem]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB9-FojLBJlrr2fTCrQ9GL6GTzq4gSs3bNQTC10qnxrujjySg2Xsv4ZidVJMAdaTzocxttPkVi83SyjktB6mgRfKpBr9bt4jZTxjHKyv4uN6-qHpggOdX9juYUeQti0gpsUwGNKX_TrRALJy54qBL5nchVNbj9hlNkKACaavJ9DkP6cLtxwcyzos750qAfuJlifYPsHSV54i6p6dy8odY8Qzzld7_lLfT56Qt5APgP2sJZp6mwaXC3QSrTb4RSYlW1oa_aiSSDkLJhK" />
        </motion.div>
      </div>

      {/* 04: Visualization */}
      <div className="grid md:grid-cols-2 gap-24 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="order-2 md:order-1 relative glass-card p-2 rounded-[2.5rem] border border-border-subtle shadow-xl overflow-hidden"
        >
          <img alt="Visual Intelligence" className="w-full h-auto rounded-[2rem]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAPSsM1hzGxXDP6_ZD5yyMgwCzHjDaa743DSoTBR8jm3Uj9XfzwdT2_Y8UKNnJf1NVXKRsP1z1rja2XcZqM27m7d-2H-FRuVaqzxjRrHEvawYk4WmM7Vq6G3UHLH_4fSK_wRMuDQpi-b0Nsc2_isSaJr1GeTe7fw9TDFqtclin2VvBlk_tpULkGVL-XIBkdT5EVi5MHgqgAUltGlPwvhO9cSMhl8tZ49DBVgj-u__kfzT6RI38jh1TWswjhPS1lZJVEVFZSmLBfd-V7" />
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="order-1 md:order-2 relative"
        >
          <div className="absolute -top-12 -left-12 text-[10rem] font-headline font-bold text-slate-custom/5 leading-none -z-10 select-none">04</div>
          <div className="space-y-6">
            <span className="inline-block text-emerald-accent font-bold tracking-widest text-sm uppercase">Visualization</span>
            <h3 className="text-4xl font-headline font-bold text-slate-custom leading-tight">Visual Intelligence <br/> &amp; Deep Drill-Down.</h3>
            <p className="text-lg text-slate-custom/70 leading-relaxed">
              More than just static charts. Create interactive dashboards that allow users to click into any data point and drill down to the underlying raw events instantly.
            </p>
            <div className="pt-6">
              <button className="px-8 py-4 bg-slate-custom text-alabaster rounded-2xl font-bold hover:opacity-90 transition-all group flex items-center gap-3 shadow-xl shadow-slate-900/10">
                Explore Viz Suite
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">insights</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

const LandingPricing = () => (
    <section className="py-32 bg-alabaster" id="pricing">
        <div className="max-w-7xl mx-auto px-8">
            <div className="text-center max-w-3xl mx-auto mb-20">
                <h2 className="text-5xl font-headline font-bold text-slate-custom mb-6 tracking-tight">Professional <span className="text-indigo-accent">Plans</span></h2>
                <p className="text-xl text-slate-custom/60">Choose the level of intelligence your enterprise requires. Deterministic accuracy for every scale.</p>
            </div>
            <div className="grid lg:grid-cols-3 gap-8">
                {/* Team */}
                <motion.div 
                  whileHover={{ y: -10 }}
                  className="bg-alabaster/40 p-10 rounded-[2.5rem] border border-border-subtle/40 hover:border-indigo-accent/30 transition-all hover:shadow-2xl hover:shadow-slate-900/10 group"
                >
                    <div className="w-12 h-12 bg-alabaster rounded-xl flex items-center justify-center mb-8 group-hover:bg-indigo-accent/10 transition-colors">
                        <span className="material-symbols-outlined text-slate-custom">bolt</span>
                    </div>
                    <h3 className="text-2xl font-headline font-bold text-slate-custom mb-2">Team</h3>
                    <p className="text-slate-custom/50 text-sm mb-8">Up to 1GB data processing</p>
                    <div className="flex items-baseline gap-1 mb-8">
                        <span className="text-5xl font-bold text-slate-custom tracking-tighter">$499</span>
                        <span className="text-slate-custom/50">/mo</span>
                    </div>
                    <ul className="space-y-5 mb-10 border-t border-border-subtle/20 pt-8">
                        {[
                          { icon: 'check', text: 'Groq/Gemini Multi-LLM', active: true },
                          { icon: 'check', text: 'Smart Ingestion (CSV)', active: true },
                          { icon: 'close', text: 'Immutable Versioning', active: false },
                        ].map((item, i) => (
                          <li key={i} className={`flex items-center gap-3 text-sm font-medium ${item.active ? 'text-slate-custom' : 'text-slate-custom/30'}`}>
                            <span className={`material-symbols-outlined ${item.active ? 'text-emerald-accent' : ''} text-xl`}>{item.icon}</span>
                            {item.text}
                          </li>
                        ))}
                    </ul>
                    <Link to="/register" className="w-full py-4 bg-indigo-accent/10 text-indigo-accent rounded-2xl font-bold hover:bg-indigo-accent hover:text-white transition-all text-center block">Get Started</Link>
                </motion.div>

                {/* Business Pro */}
                <motion.div 
                  whileHover={{ y: -10 }}
                  className="relative bg-indigo-accent text-white p-10 rounded-[2.5rem] shadow-2xl shadow-indigo-900/20 z-10 lg:scale-105"
                >
                    <div className="absolute top-6 right-6 bg-indigo-accent text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">Pro Recommended</div>
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-8">
                        <span className="material-symbols-outlined text-white">workspace_premium</span>
                    </div>
                    <h3 className="text-2xl font-headline font-bold mb-2">Business Pro</h3>
                    <p className="text-white/50 text-sm mb-8">Unlimited data ingestion</p>
                    <div className="flex items-baseline gap-1 mb-8">
                        <span className="text-5xl font-bold tracking-tighter text-white font-headline">$1,299</span>
                        <span className="text-white/50">/mo</span>
                    </div>
                    <ul className="space-y-5 mb-10 border-t border-white/10 pt-8">
                        {['Data Cleaning Studio 2.0', 'Visual Penalty Breakdowns', 'DuckDB-Verified Results', 'Full JWT Audit Trails'].map((item, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-medium">
                            <span className="material-symbols-outlined text-emerald-accent text-xl">check</span>
                            {item}
                          </li>
                        ))}
                    </ul>
                    <Link to="/register" className="w-full py-4 bg-white/10 text-white rounded-2xl font-bold hover:bg-white hover:text-indigo-accent transition-all shadow-lg shadow-indigo-600/20 text-center block">Upgrade to Pro</Link>
                </motion.div>

                {/* Enterprise */}
                <motion.div 
                  whileHover={{ y: -10 }}
                  className="bg-alabaster/40 p-10 rounded-[2.5rem] border border-border-subtle/40 hover:border-indigo-accent/30 transition-all hover:shadow-2xl hover:shadow-slate-900/10 group"
                >
                    <div className="w-12 h-12 bg-alabaster rounded-xl flex items-center justify-center mb-8 group-hover:bg-indigo-accent/10 transition-colors">
                        <span className="material-symbols-outlined text-slate-custom">corporate_fare</span>
                    </div>
                    <h3 className="text-2xl font-headline font-bold text-slate-custom mb-2">Custom</h3>
                    <p className="text-slate-custom/50 text-sm mb-8">On-premise deployment</p>
                    <div className="flex items-baseline gap-1 mb-8">
                        <span className="text-5xl font-bold text-slate-custom tracking-tighter">Custom</span>
                    </div>
                    <ul className="space-y-5 mb-10 border-t border-border-subtle/20 pt-8">
                        {['Llama-3 Self-Hosted', 'Dedicated Pandas Clusters', '24/7 Priority Support'].map((item, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-medium text-slate-custom">
                            <span className="material-symbols-outlined text-emerald-accent text-xl">check</span>
                            {item}
                          </li>
                        ))}
                    </ul>
                    <button className="w-full py-4 border border-border-subtle/20 bg-alabaster text-slate-custom rounded-2xl font-bold hover:bg-indigo-accent/10 transition-all">Contact Sales</button>
                </motion.div>
            </div>
        </div>
    </section>
);

const LandingFooter = () => (
    <footer className="bg-alabaster border-t border-border-subtle/20 pt-24 pb-12 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16 mb-24">
            <div className="space-y-8">
                <div className="flex items-center gap-2 text-2xl font-bold font-headline text-slate-custom">
                    <span className="w-8 h-8 bg-indigo-accent rounded-lg flex items-center justify-center text-white text-base">V</span>
                    Vizzy Pilot
                </div>
                <p className="text-slate-custom/60 leading-relaxed max-w-xs text-sm">Deterministic conversational intelligence for the modern enterprise.</p>
            </div>
            <div>
                <h4 className="font-headline font-bold text-lg text-slate-custom mb-8">Platform</h4>
                <ul className="space-y-4 text-sm">
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">Cleaning Studio 2.0</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">LLM Gateway</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">Viz Suite</a></li>
                </ul>
            </div>
            <div>
                <h4 className="font-headline font-bold text-lg text-slate-custom mb-8">Security</h4>
                <ul className="space-y-4 text-sm">
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">JWT Integration</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">RBAC Governance</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">Privacy Policy</a></li>
                </ul>
            </div>
            <div>
                <h4 className="font-headline font-bold text-lg text-slate-custom mb-8">Developer</h4>
                <ul className="space-y-4 text-sm">
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">DuckDB Docs</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">API Status</a></li>
                    <li><a className="text-slate-custom/60 hover:text-indigo-accent transition-colors" href="#">Schema Specs</a></li>
                </ul>
            </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-border-subtle flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium text-slate-custom/40">
            <p>© 2026 Vizzy Pilot Enterprise. All rights reserved.</p>
            <div className="flex items-center gap-8">
                <a className="hover:text-slate-custom transition-colors" href="#">Privacy</a>
                <a className="hover:text-slate-custom transition-colors" href="#">Terms</a>
            </div>
        </div>
    </footer>
);

export default function Landing() {
  return (
    <div className="bg-alabaster font-body selection:bg-indigo-accent/20">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingCapabilities />
        <LandingDeepDive />
        <LandingPricing />
        
        {/* Final CTA Section */}
        <section className="py-32 px-8 overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative bg-[#0A0B0F] rounded-[3.5rem] p-16 md:p-24 text-center overflow-hidden border border-white/5 shadow-2xl shadow-indigo-950/20"
            >
              <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none">
                <img alt="Background pattern" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA9XVrtex4FgfLGepu7-v03xRdo2L5UrcnTptxBfTfVowr33TQm11pdSYgwkTmmLCYUVPqG0JlaBTscF3O8flM---a4ces2D_6f1pt41t3CBpZxo0Mzx2RLAZttNtwLajmaK7qXTyqxNSsBdAUqsPvUOBscHbr3ysZW64olROV2ZuaCsBzyB_DzSAe4DUfXft08qz0PGvZrbPtM_mtR3hinPmTJYFJVaAIZ7v59BwaTPAh3u9lhEST_XzInJv-nsgBN-72ce_qOrWFP" />
              </div>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-indigo-accent/20 to-transparent"></div>
              <div className="relative z-10">
                <h2 className="text-5xl md:text-7xl font-headline font-bold text-white mb-8 leading-tight tracking-tight">Experience <span className="italic text-emerald-accent">Vizzy Pilot.</span></h2>
                <p className="text-xl text-white/70 mb-14 max-w-2xl mx-auto leading-relaxed">
                  Join 500+ global enterprises orchestrating data with conversational intelligence. Secure, deterministic, and blazing fast.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-6">
                  <Link to="/register" className="px-12 py-5 bg-indigo-accent text-white rounded-2xl font-bold text-xl hover:scale-105 transition-all shadow-2xl shadow-indigo-600/40 text-center">Request Access</Link>
                  <button className="px-12 py-5 bg-white/5 text-white/50 border border-white/10 backdrop-blur-md rounded-2xl font-bold text-xl hover:bg-white/10 hover:text-white transition-all">Technical Spec</button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
