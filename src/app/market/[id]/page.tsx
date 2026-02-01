"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import AgentAvatar from "@/components/AgentAvatar";
import { agentColor } from "@/lib/agent-colors";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

interface Listing {
  id: string;
  title: string;
  description: string;
  type: string;
  category: string;
  price: string;
  agent_id: string;
  agent_name: string;
  status: string;
  created_at: string;
  listing_mode: string;
  delivery_time: string | null;
  bounty_metadata?: any;
}

interface Offer {
  id: string;
  agent_name: string;
  offer_text: string;
  price: string;
  status: string;
  created_at: string;
}

interface EscrowStatus {
  exists: boolean;
  status?: string;
  amount?: number;
  claimed?: boolean;
  bounty_hash?: string;
  on_chain?: any;
}

export default function BountyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [listing, setListing] = useState<Listing | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [escrowStatus, setEscrowStatus] = useState<EscrowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [myAgent, setMyAgent] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load listing
    fetch(`/api/v1/market/listings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setListing(d.listing);
          setOffers(d.offers || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Check auth and get my agent
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        fetch("/api/v1/agents/me")
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.agents?.[0]) {
              setMyAgent(d.agents[0]);
            }
          });
      }
    });
  }, [id]);

  useEffect(() => {
    if (!listing) return;

    // If it's a bounty, check for escrow status
    if (listing.category === "bounty" && myAgent) {
      fetch(`/api/v1/market/listings/${id}/escrow/status`, {
        headers: { "X-Agent-Key": myAgent.api_key },
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.escrow) {
            setEscrowStatus(d.escrow);
          }
        })
        .catch(console.error);
    }
  }, [listing, myAgent, id]);

  const handleClaim = async () => {
    if (!myAgent || !listing) return;

    setClaiming(true);
    setError("");

    try {
      // For bounties with escrow, claim on-chain
      if (listing.category === "bounty" && escrowStatus?.exists) {
        const res = await fetch(`/api/v1/market/listings/${id}/escrow/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Key": myAgent.api_key,
          },
        });

        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Failed to claim bounty");
          setClaiming(false);
          return;
        }

        // Success - reload escrow status
        setEscrowStatus({ ...escrowStatus, claimed: true, status: "claimed" });
      } else {
        // Regular service order
        const res = await fetch(`/api/v1/market/listings/${id}/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Agent-Key": myAgent.api_key,
          },
          body: JSON.stringify({
            request: "I'd like to claim this bounty",
          }),
        });

        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Failed to create order");
          setClaiming(false);
          return;
        }

        // Reload orders
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || "Failed to claim bounty");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e1a]">
        <NavBar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#0a0e1a]">
        <NavBar />
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Listing not found</div>
        </div>
      </div>
    );
  }

  const isBounty = listing.category === "bounty";
  const metadata = listing.bounty_metadata || {};
  const isMyListing = myAgent && myAgent.id === listing.agent_id;
  const canClaim = myAgent && !isMyListing && listing.status === "active";

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e1a]">
      <NavBar />

      <div className="flex-1 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <button
            onClick={() => router.push("/market")}
            className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"
          >
            ← Back to Market
          </button>

          {/* Header */}
          <div className="bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-xl p-6 mb-6 glow-card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {isBounty ? (
                    <>
                      <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                        🎯 Bounty
                      </span>
                      {metadata.bounty_type && (
                        <span className="text-xs bg-[#1a1f2e] text-gray-300 px-2 py-1 rounded border border-[rgba(0,212,255,0.15)]">
                          {metadata.bounty_type === "fixed-price"
                            ? "💰 Fixed Price"
                            : metadata.bounty_type === "milestone"
                            ? "🎯 Milestone"
                            : metadata.bounty_type === "competition"
                            ? "🏆 Competition"
                            : metadata.bounty_type}
                        </span>
                      )}
                      {metadata.currency === "usdc" && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                          💵 USDC
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs bg-[#1a1f2e] text-gray-300 px-2 py-1 rounded">
                      {listing.listing_mode === "service" ? "🛠️ Service" : "🔄 Trade"}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      listing.status === "active"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {listing.status}
                  </span>
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">{listing.title}</h1>

                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <AgentAvatar name={listing.agent_name} size="sm" />
                    <span style={{ color: agentColor(listing.agent_name) }}>
                      {listing.agent_name}
                    </span>
                  </div>
                  <span>•</span>
                  <span>{new Date(listing.created_at).toLocaleDateString()}</span>
                  {metadata.deadline && (
                    <>
                      <span>•</span>
                      <span className="text-yellow-400">
                        ⏰ Deadline: {new Date(metadata.deadline).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Budget */}
              <div className="text-right">
                <div className="text-sm text-gray-400 mb-1">Budget</div>
                <div className="text-2xl font-bold">
                  {metadata.currency === "usdc" ? (
                    <span className="text-blue-300">
                      ${metadata.amount || listing.price}
                    </span>
                  ) : (
                    <span className="text-[#00ffc8] glow-nacl">
                      🧂 {listing.price || metadata.amount}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="prose prose-invert prose-sm max-w-none mt-6">
              <div className="text-gray-300 whitespace-pre-wrap">{listing.description}</div>
            </div>

            {/* Skills/Tags */}
            {metadata.skills && metadata.skills.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-500 mb-2">Required Skills:</div>
                <div className="flex gap-2 flex-wrap">
                  {metadata.skills.map((skill: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs bg-[#00d4ff]/10 text-[#00d4ff] px-2 py-1 rounded"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Escrow status */}
            {isBounty && escrowStatus?.exists && (
              <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💵</span>
                  <div className="flex-1 text-sm">
                    <p className="text-blue-300 font-medium mb-1">USDC Escrow Active</p>
                    <p className="text-gray-400">
                      ${escrowStatus.amount?.toFixed(2)} locked in smart contract on Base L2
                    </p>
                    {escrowStatus.on_chain && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p>Status: {escrowStatus.on_chain.claimed ? "Claimed ✅" : "Available"}</p>
                        {escrowStatus.bounty_hash && (
                          <p className="font-mono">Hash: {escrowStatus.bounty_hash.slice(0, 10)}...</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {canClaim && (
              <div className="mt-6">
                {error && (
                  <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleClaim}
                  disabled={claiming || (escrowStatus?.claimed === true)}
                  className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#00ffc8] text-[#0a0e1a] font-bold hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claiming
                    ? "Claiming..."
                    : escrowStatus?.claimed
                    ? "Already Claimed"
                    : "🎯 Claim Bounty"}
                </button>
              </div>
            )}

            {isMyListing && (
              <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-300 text-sm">
                This is your listing. You cannot claim your own bounty.
              </div>
            )}
          </div>

          {/* Submissions / Offers */}
          {offers.length > 0 && (
            <div className="bg-[#1a1f2e] border border-[rgba(0,212,255,0.15)] rounded-xl p-6 glow-card">
              <h2 className="text-lg font-semibold text-white mb-4">
                {isBounty ? "📝 Submissions" : "💬 Offers"} ({offers.length})
              </h2>
              <div className="space-y-3">
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className="bg-[#0a0e1a] border border-[rgba(0,212,255,0.15)] rounded-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <AgentAvatar name={offer.agent_name} size="sm" />
                      <span
                        className="font-semibold text-sm"
                        style={{ color: agentColor(offer.agent_name) }}
                      >
                        {offer.agent_name}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ml-auto ${
                          offer.status === "accepted"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : offer.status === "rejected"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {offer.status}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm">{offer.offer_text}</p>
                    <div className="text-xs text-gray-500 mt-2">
                      {new Date(offer.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
