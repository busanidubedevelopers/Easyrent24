"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, FileText, Hammer, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } }
  };

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 md:pt-40 lg:pt-48 pb-16 md:pb-24 lg:pb-32 min-h-screen flex items-center justify-center">
        {/* Scenic Background */}
        <div className="absolute inset-0 z-0">
           <motion.div 
             initial={{ scale: 1.1, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             transition={{ duration: 1.5, ease: "easeOut" }}
             className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=2075&q=80')] bg-cover bg-center" 
           />
           {/* Gradient Mesh Overlay */}
           <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background backdrop-blur-[2px]" />
           <div className="absolute inset-0 bg-brand/5 mix-blend-overlay" />
           <div className="orb orb-1 opacity-50" />
           <div className="orb orb-2 opacity-30" />
        </div>

        <div className="container relative z-10 mx-auto px-4 md:px-6">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center gap-6 text-center lg:gap-10"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center rounded-full border border-indigo-200/50 bg-white/20 backdrop-blur-md px-4 py-1.5 text-sm font-medium text-foreground dark:border-indigo-800/50 dark:bg-black/30 dark:text-indigo-300 shadow-xl">
              <span className="flex h-2 w-2 rounded-full bg-brand mr-2 animate-pulse"></span>
              The Rental Revolution is Here
            </motion.div>
            
            <motion.h1 variants={itemVariants} className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl drop-shadow-xl">
              Rent with Confidence. <br className="hidden md:inline" /> Manage with Ease.
            </motion.h1>
            
            <motion.p variants={itemVariants} className="max-w-2xl text-lg font-medium text-foreground/80 sm:text-xl md:text-xl drop-shadow-lg">
              EasyRent simplifies the rental lifecycle. From verified credit reports to trusted handyman services, we connect landlords, tenants, and professionals in one premium marketplace.
            </motion.p>
            
            <motion.div variants={itemVariants} className="flex flex-col w-full sm:flex-row justify-center gap-4 mt-6">
              <Link 
                href="/find-home"
                className="inline-flex h-14 items-center justify-center rounded-full bg-gradient-to-r from-brand via-indigo-500 to-cyan-500 px-8 text-base font-bold text-white shadow-[0_8px_30px_rgba(79,70,229,0.4)] transition-all duration-300 hover:shadow-[0_8px_40px_rgba(79,70,229,0.6)] hover:-translate-y-1 hover:scale-105"
              >
                Start Renting
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link 
                href="/list-property"
                className="inline-flex h-14 items-center justify-center rounded-full border border-white/40 bg-white/10 backdrop-blur-md px-8 text-base font-bold text-foreground transition-all duration-300 hover:bg-white/20 hover:-translate-y-1 hover:shadow-lg shadow-xl"
              >
                List Your Property
              </Link>
            </motion.div>
          </motion.div>
          
          {/* Dashboard Preview */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1, type: "spring", stiffness: 50 }}
            className="mt-20 md:mt-32 relative mx-auto max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 shadow-2xl lg:p-4"
          >
            <div className="aspect-[16/9] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-border/50 relative group">
               <Image 
                 src="/images/dashboard-preview.png" 
                 alt="EasyRent Dashboard Preview" 
                 fill
                 className="object-cover transition-transform duration-1000 group-hover:scale-105"
               />
               
               {/* Floating Badge */}
               <motion.div 
                 animate={{ y: [0, -10, 0] }}
                 transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                 className="absolute bottom-6 right-6 bg-white/90 dark:bg-black/80 backdrop-blur px-5 py-3 rounded-xl shadow-2xl border border-border/50 flex items-center gap-3"
               >
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.7)]" />
                  <span className="text-sm font-bold tracking-wide">Live System Demo</span>
               </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 md:py-32 lg:px-6 relative z-10">
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center"
        >
          <motion.h2 variants={itemVariants} className="text-3xl font-bold leading-[1.1] sm:text-3xl md:text-5xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
            Everything You Need
          </motion.h2>
          <motion.p variants={itemVariants} className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            We provide verified data and trusted professionals to make renting seamless.
          </motion.p>
        </motion.div>
        
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="mx-auto grid justify-center gap-8 sm:grid-cols-2 lg:grid-cols-3 mt-16 max-w-6xl"
        >
          {/* Feature 1 */}
          <motion.div variants={itemVariants} className="card-premium p-8 group hover:-translate-y-2 transition-all duration-300 shadow-lg hover:shadow-2xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/20 to-cyan-500/20 text-brand transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h3 className="mb-3 text-xl font-bold group-hover:text-brand transition-colors">Credit Reports</h3>
            <p className="text-muted-foreground leading-relaxed">
              Instant, secure credit checks for potential tenants. Landlords get peace of mind; tenants get approved faster.
            </p>
          </motion.div>
          
          {/* Feature 2 */}
          <motion.div variants={itemVariants} className="card-premium p-8 group hover:-translate-y-2 transition-all duration-300 shadow-lg hover:shadow-2xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-500 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3 shadow-inner">
              <Hammer className="h-7 w-7" />
            </div>
            <h3 className="mb-3 text-xl font-bold group-hover:text-indigo-500 transition-colors">Handyman Hub</h3>
            <p className="text-muted-foreground leading-relaxed">
              Find trusted plumbers, electricians, and fixers. Bid on jobs, read reviews, and get work done.
            </p>
          </motion.div>
           
           {/* Feature 3 */}
          <motion.div variants={itemVariants} className="card-premium p-8 group hover:-translate-y-2 transition-all duration-300 shadow-lg hover:shadow-2xl">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-brand/20 text-cyan-500 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner">
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="mb-3 text-xl font-bold group-hover:text-cyan-500 transition-colors">Bank Statements</h3>
            <p className="text-muted-foreground leading-relaxed">
              Verified income proof and bank statement retrieval. Reduce fraud and ensure financial stability.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* Trust Stats / Social Proof */}
      <section className="border-y border-border bg-zinc-50/50 dark:bg-zinc-900/50 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03]"></div>
        <div className="container mx-auto px-4 py-16 md:py-24 lg:px-6 relative z-10">
           <motion.div 
             initial="hidden"
             whileInView="show"
             viewport={{ once: true }}
             variants={containerVariants}
             className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-center"
           >
             <motion.div variants={itemVariants} className="flex flex-col gap-2">
               <h4 className="text-4xl font-bold text-brand">10k+</h4>
               <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Active Listings</p>
             </motion.div>
             <motion.div variants={itemVariants} className="flex flex-col gap-2">
               <h4 className="text-4xl font-bold text-brand">98%</h4>
               <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Verified Tenants</p>
             </motion.div>
             <motion.div variants={itemVariants} className="flex flex-col gap-2">
               <h4 className="text-4xl font-bold text-brand">5k+</h4>
               <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Trusted Handymen</p>
             </motion.div>
              <motion.div variants={itemVariants} className="flex flex-col gap-2">
               <h4 className="text-4xl font-bold text-brand">4.9/5</h4>
               <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">User Rating</p>
             </motion.div>
           </motion.div>
        </div>
      </section>

      {/* Press & Preferred Sources Section (SEO E-E-A-T Booster) */}
      <section className="border-b border-border bg-white dark:bg-black py-12 relative overflow-hidden">
        <div className="container mx-auto px-4 lg:px-6 relative z-10 text-center">
           <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-8">
              Recognized as a Preferred Source by
           </p>
           <motion.div 
             initial="hidden"
             whileInView="show"
             viewport={{ once: true }}
             variants={containerVariants}
             className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-70 grayscale hover:grayscale-0 transition-all duration-500"
           >
              {/* Note: In a real app, these would be actual SVG logos. We use stylized text for the demo. */}
              <motion.div variants={itemVariants} className="text-xl md:text-2xl font-black font-serif tracking-tighter">
                Forbes
              </motion.div>
              <motion.div variants={itemVariants} className="text-xl md:text-2xl font-bold tracking-tight text-green-700 dark:text-green-500">
                TechCrunch
              </motion.div>
              <motion.div variants={itemVariants} className="text-xl md:text-2xl font-extrabold text-blue-600">
                Property<span className="font-light">Insider</span>
              </motion.div>
              <motion.div variants={itemVariants} className="text-xl md:text-2xl font-bold tracking-widest uppercase">
                Bloomberg
              </motion.div>
              <motion.div variants={itemVariants} className="text-xl md:text-2xl font-bold font-mono">
                WSJ
              </motion.div>
           </motion.div>
        </div>
      </section>

      {/* Testimonial Spotlight */}
      <section className="container mx-auto px-4 py-16 lg:px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-indigo-700 to-cyan-600 text-white shadow-[0_20px_50px_rgba(79,70,229,0.3)] border border-white/20"
        >
          <div className="absolute inset-0 bg-[url('/images/hero-apartment.png')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
          <motion.div 
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/20 blur-[100px] rounded-full mix-blend-overlay"
          ></motion.div>
          
          <div className="relative z-10 grid gap-8 p-8 md:p-12 lg:grid-cols-2 items-center glass-light border-0 rounded-none bg-transparent dark:bg-transparent shadow-none">
            <div className="order-2 lg:order-1 space-y-6">
               <div className="inline-flex items-center rounded-full bg-indigo-400/30 border border-indigo-200/30 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-50">
                  Tenant Success Story
               </div>
               <blockquote className="space-y-4">
                  <p className="text-xl md:text-2xl font-medium leading-relaxed drop-shadow-md">
                    &quot;I was struggling to find a place that accepted my credit profile. EasyRent verified my income directly, and I got approved for my dream apartment in 2 days. The handyman service for moving help was a bonus!&quot;
                  </p>
                  <footer className="flex items-center gap-4 pt-4">
                    <div className="font-bold text-lg">Sarah Jenkins</div>
                    <div className="text-indigo-200 text-sm font-medium">Tenant since 2024</div>
                  </footer>
               </blockquote>
            </div>
            
            <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
               <div className="relative h-64 w-64 md:h-80 md:w-80 overflow-hidden rounded-full border-4 border-white/20 shadow-2xl">
                  <Image 
                    src="/images/happy-tenant.png" 
                    alt="Happy Tenant Sarah" 
                    fill
                    className="object-cover"
                  />
               </div>
            </div>
          </div>
        </motion.div>
      </section>
      
      {/* Handyman Section Spotlight */}
      <section className="container mx-auto px-4 py-20 md:py-32 lg:px-6">
         <div className="grid gap-12 lg:grid-cols-2 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative aspect-square lg:aspect-auto lg:h-[600px] rounded-2xl overflow-hidden shadow-2xl bg-zinc-100 dark:bg-zinc-800 border border-border group"
            >
               <Image 
                  src="/images/plumbing-professional.png" 
                  alt="Professional Handyman at work" 
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
               />
               
               {/* Overlay Card */}
               <div className="absolute bottom-6 left-6 right-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-border/50 flex items-center gap-4 transition-transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="h-12 w-12 bg-brand/10 rounded-full flex items-center justify-center text-brand">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-bold">Verified Professional</div>
                    <div className="text-xs text-muted-foreground">Background checked & skill tested</div>
                  </div>
               </div>
            </motion.div>
            
            <motion.div 
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={containerVariants}
              className="flex flex-col gap-6"
            >
               <motion.div variants={itemVariants} className="inline-flex items-center w-fit rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                  For Landlords & Agents
               </motion.div>
               <motion.h2 variants={itemVariants} className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
                 Maintenance Made Simple with <span className="text-brand">Handyman Bidding</span>
               </motion.h2>
               <motion.p variants={itemVariants} className="text-lg text-muted-foreground">
                 Post a job, receive bids from rated professionals, and choose the best price and quality combination.
               </motion.p>
               
               <motion.ul variants={containerVariants} className="grid gap-4 mt-4">
                 <motion.li variants={itemVariants} className="flex items-center gap-3">
                   <div className="bg-brand/10 p-1.5 rounded-full"><CheckCircle2 className="h-4 w-4 text-brand" /></div>
                   <span className="font-medium">Verified Tradespeople</span>
                 </motion.li>
                 <motion.li variants={itemVariants} className="flex items-center gap-3">
                   <div className="bg-brand/10 p-1.5 rounded-full"><CheckCircle2 className="h-4 w-4 text-brand" /></div>
                   <span className="font-medium">Transparent Bidding System</span>
                 </motion.li>
                 <motion.li variants={itemVariants} className="flex items-center gap-3">
                   <div className="bg-brand/10 p-1.5 rounded-full"><CheckCircle2 className="h-4 w-4 text-brand" /></div>
                   <span className="font-medium">Secure Payments & Reviews</span>
                 </motion.li>
               </motion.ul>
               
               <motion.div variants={itemVariants} className="mt-6">
                  <Link href="#" className="inline-flex h-14 items-center justify-center rounded-xl bg-brand px-8 text-sm font-bold text-white shadow-lg transition-all hover:bg-brand/90 hover:scale-105 hover:shadow-brand/30">
                    Find a Pro <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
               </motion.div>
            </motion.div>
         </div>
      </section>
      
      {/* CTA */}
      <section className="container mx-auto px-4 py-20 lg:px-6 pb-32">
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-3xl bg-brand px-6 py-16 md:px-16 md:py-24 text-center shadow-2xl"
        >
          <div className="absolute inset-0 z-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] animate-[shimmer_3s_infinite]"></div>
          
          <div className="relative z-10 mx-auto max-w-3xl flex flex-col items-center gap-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Simplify Your Rentals?
            </h2>
            <p className="text-lg text-indigo-100">
              Join thousands of happy landlords, tenants, and professionals on EasyRent today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
               <Link 
                href="/signup"
                className="inline-flex h-14 items-center justify-center rounded-full bg-white px-10 text-base font-bold text-brand shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              >
                Get Started for Free
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
