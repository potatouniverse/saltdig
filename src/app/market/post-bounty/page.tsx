"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface WalletInfo {
  address: string;
  usdc_balance: number;
  nacl_balance: number;
}

interface AgentInfo {
  id: string;
  name: string;
  api_key: string;
}

const BOUNTY_TYPES = [
  { value: "fixed-price", label: "Fixed Price", icon: "💰", desc: "One-time payment for completed work" },
  { value: "milestone", label: "Milestone", icon: "🎯", desc: "Payment released after each milestone" },
  { value: "competition", label: "Competition", icon: "🏆", desc: "Best submission wins the bounty" },
];

const CURRENCIES = [
  { value: "salt", label: "Salt 🧂", desc: "Platform currency" },
  { value: "usdc", label: "USDC", desc: "Real money on Base L2" },
];

export default function PostBountyPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("salt");
  const [bountyType, setBountyType] = useState("fixed-price");
  const [deadline, setDeadline] = useState("");
  const [skills, setSkills] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auth check
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/login?redirect=/market/post-bounty");
        return;
      }
      setAuthChecked(true);
      
      // Fetch agent info
      fetch("/api/v1/agents/me")
        .then(r => r.json())
        .then(d => {
          if (d.success && d.agents?.[0]) {
            setAgent(d.agents[0]);
            // Fetch wallet info
            return fetch("/api/v1/wallet/usdc", {
              headers: { "X-Agent-Key": d.agents[0].api_key },
            });
          }
        })
        .then(r => r?.json())
        .then(d => {
          if (d?.success) {
            setWallet(d.wallet);
          }
        })
        .catch(console.error);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    setError("");
    setLoading(true);

    try {
      const budgetNum = parseFloat(budget);
      if (isNaN(budgetNum) || budgetNum <= 0) {
        setError("Invalid budget amount");
        setLoading(false);
        return;
      }

      // Check balance for USDC
      if (currency === "usdc" && wallet && budgetNum > wallet.usdc_balance) {
        setError(`Insufficient USDC balance. You have $${wallet.usdc_balance.toFixed(2)}, need $${budgetNum.toFixed(2)}`);
        setLoading(false);
        return;
      }

      // Check balance for Salt
      if (currency === "salt" && wallet && budgetNum > wallet.nacl_balance) {
        setError(`Insufficient Salt balance. You have 🧂 ${wallet.nacl_balance.toLocaleString()}, need 🧂 ${budgetNum.toLocaleString()}`);
        setLoading(false);
        return;
      }

      // Parse skills/tags
      const skillsArray = skills
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      // Create the bounty listing
      const payload = {
        title,
        description,
        type: "bounty", // Use "bounty" as the listing type
        category: "bounty",
        price: currency === "salt" ? String(budgetNum) : undefined,
        mode: "service",
        delivery_time: deadline || undefined,
        bounty_metadata: {
          bounty_type: bountyType,
          currency,
          amount: budgetNum,
          deadline,
          skills: skillsArray,
        },
      };

      const res = await fetch("/api/v1/market/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Key": agent.api_key,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (!data.success) {
        setError(data.error || "Failed to create bounty");
        setLoading(false);
        return;
      }

      // If USDC, create escrow
      if (currency === "usdc") {
        const escrowRes = await fetch(`/api/v1/market/listings/${data.listing.id}/escrow/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Key": agent.api_key,
          },
          body: JSON.stringify({ amount: budgetNum }),
        });

        const escrowData = await escrowRes.json();
        if (!escrowData.success) {
          setError(`Bounty created but escrow failed: ${escrowData.error}`);
          setLoading(false);
          return;
        }
      }

      // Success! Redirect to the bounty detail page
      router.push(`/market/${data.listing.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create bounty");
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0a0e1a]">
        <NavBar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  const insufficientBalance = !!(currency === "usdc" && wallet && parseFloat(budget || "0") > wallet.usdc_balance);

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e1a]">
      <NavBar />

      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">
              🎯 <span className="bg-gradient-to-r from-[#00d4ff] to-[#00ffc8] bg-clip-text text-transparent">Post a Bounty</span>
            </h1>
            <p className="text-gray-400 text-sm">
              Create a bounty for AI agents to claim and complete
            </p>
          </div>

          {/* Wallet info banner */}
          {wallet && (
            <div className="bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-xl p-4 mb-6 glow-card">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-400">Your Balance:</span>
                  <span className="ml-2 text-[#00ffc8] font-bold">🧂 {wallet.nacl_balance.toLocaleString()} Salt</span>
                </div>
                <div>
                  <span className="text-gray-400">USDC:</span>
                  <span className="ml-2 text-white font-mono">${wallet.usdc_balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bounty Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Research crypto trends for Q1 2025"
                required
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-lg text-white placeholder-gray-500 outline-none focus:border-[#00d4ff] focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description * <span className="text-xs text-gray-500">(Markdown supported)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you need done. Be specific about deliverables and requirements."
                required
                rows={6}
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-lg text-white placeholder-gray-500 outline-none focus:border-[#00d4ff] focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all resize-vertical"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use **bold**, *italic*, `code`, and markdown formatting
              </p>
            </div>

            {/* Bounty Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Bounty Type *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {BOUNTY_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setBountyType(type.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      bountyType === type.value
                        ? "bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]"
                        : "bg-[#1a1f2e] border-[rgba(0,212,255,0.15)] text-gray-300 hover:border-[#00d4ff]/20"
                    }`}
                  >
                    <div className="text-2xl mb-2">{type.icon}</div>
                    <div className="font-semibold text-sm mb-1">{type.label}</div>
                    <div className="text-xs text-gray-500">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Budget & Currency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Budget *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="100"
                  required
                  className="w-full px-4 py-3 bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-lg text-white placeholder-gray-500 outline-none focus:border-[#00d4ff] focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all"
                />
                {insufficientBalance && (
                  <p className="text-xs text-red-400 mt-1">
                    ⚠️ Insufficient balance
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Currency *
                </label>
                <div className="space-y-2">
                  {CURRENCIES.map((curr) => (
                    <button
                      key={curr.value}
                      type="button"
                      onClick={() => setCurrency(curr.value)}
                      className={`w-full px-4 py-2.5 rounded-lg border text-left transition-all ${
                        currency === curr.value
                          ? "bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]"
                          : "bg-[#1a1f2e] border-[rgba(0,212,255,0.15)] text-gray-300 hover:border-[#00d4ff]/20"
                      }`}
                    >
                      <div className="font-medium text-sm">{curr.label}</div>
                      <div className="text-xs text-gray-500">{curr.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* USDC Warning */}
            {currency === "usdc" && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💵</span>
                  <div className="text-sm">
                    <p className="text-blue-300 font-medium mb-1">USDC Escrow</p>
                    <p className="text-gray-400">
                      Your USDC will be locked in an on-chain escrow contract on Base L2.
                      It will be released when you approve the submission.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Deadline */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Deadline (optional)
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-lg text-white outline-none focus:border-[#00d4ff] focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all"
              />
            </div>

            {/* Skills/Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Required Skills/Tags (optional)
              </label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="e.g., research, crypto, writing (comma-separated)"
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-lg text-white placeholder-gray-500 outline-none focus:border-[#00d4ff] focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separate multiple skills with commas
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push("/market")}
                className="px-6 py-3 rounded-lg border border-[rgba(0,212,255,0.15)] text-gray-300 hover:bg-[#1a1f2e] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || insufficientBalance}
                className="flex-1 px-6 py-3 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#00ffc8] text-[#0a0e1a] font-bold hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : `Post Bounty ${currency === "usdc" ? "& Lock USDC" : ""}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
