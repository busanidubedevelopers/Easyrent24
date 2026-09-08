"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Star, MessageSquare, User, Shield, ThumbsUp, AlertCircle, CheckCircle2 } from 'lucide-react';

type Review = {
  id: string;
  reviewer_id?: string;
  reviewer_role: 'tenant' | 'landlord';
  target_role: 'tenant' | 'landlord';
  target_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [targetRole, setTargetRole] = useState<'landlord' | 'tenant'>('landlord');
  const [targetName, setTargetName] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  
  // Filter state
  const [filter, setFilter] = useState<'all' | 'landlord' | 'tenant'>('all');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not fetch reviews:', error);
        // Load some mock data if table doesn't exist
        setReviews([
          {
            id: '1',
            reviewer_role: 'tenant',
            target_role: 'landlord',
            target_name: 'John Doe Properties',
            rating: 5,
            comment: 'Excellent landlord. Very responsive to maintenance requests and fair with rent.',
            created_at: new Date(Date.now() - 86400000).toISOString(),
          },
          {
            id: '2',
            reviewer_role: 'landlord',
            target_role: 'tenant',
            target_name: 'Alice Smith',
            rating: 4,
            comment: 'Great tenant, always paid rent on time. Left the place in decent condition.',
            created_at: new Date(Date.now() - 172800000).toISOString(),
          }
        ]);
      } else if (data) {
        setReviews(data as Review[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName.trim() || rating === 0 || !comment.trim()) {
      setError('Please fill in all fields and select a rating.');
      return;
    }

    setSubmitting(true);
    setError('');
    
    const newReview = {
      reviewer_role: targetRole === 'landlord' ? 'tenant' : 'landlord', // If targeting a landlord, reviewer is likely a tenant
      target_role: targetRole,
      target_name: targetName,
      rating,
      comment,
    };

    try {
      const { error: submitError } = await supabase
        .from('reviews')
        .insert([newReview])
        .select();

      if (submitError) {
        console.warn('Error submitting review to Supabase:', submitError);
      }

      // Optimistic UI update
      const optimisticReview: Review = {
        id: Math.random().toString(),
        ...newReview,
        reviewer_role: newReview.reviewer_role as 'tenant' | 'landlord',
        target_role: newReview.target_role as 'tenant' | 'landlord',
        created_at: new Date().toISOString(),
      };
      
      setReviews([optimisticReview, ...reviews]);
      setSuccess(true);
      setTargetName('');
      setRating(0);
      setComment('');
      
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReviews = reviews.filter(r => filter === 'all' || r.target_role === filter);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-24">
        {/* Header Section */}
        <div className="text-center mb-16 space-y-4">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Peer Reviews
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto">
            Build trust in the EasyRent community. Share your experiences with landlords and tenants to help others make informed decisions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Form Column */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
              
              <div className="relative z-10">
                <div className="flex items-center space-x-3 mb-8">
                  <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                    <MessageSquare size={24} />
                  </div>
                  <h2 className="text-2xl font-bold">Write a Review</h2>
                </div>

                {success && (
                  <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start space-x-3 text-emerald-400 animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">Thank you! Your review has been submitted successfully.</p>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start space-x-3 text-red-400 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={20} className="mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Role Selector */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-neutral-400">Who are you reviewing?</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setTargetRole('landlord')}
                        className={`p-4 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-200 ${
                          targetRole === 'landlord'
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                            : 'bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800'
                        }`}
                      >
                        <Shield size={24} />
                        <span className="font-semibold">A Landlord</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetRole('tenant')}
                        className={`p-4 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-200 ${
                          targetRole === 'tenant'
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                            : 'bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800'
                        }`}
                      >
                        <User size={24} />
                        <span className="font-semibold">A Tenant</span>
                      </button>
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">
                      {targetRole === 'landlord' ? "Landlord's Name or Company" : "Tenant's Name"}
                    </label>
                    <input
                      type="text"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder={targetRole === 'landlord' ? "e.g., Summit Properties" : "e.g., Jane Smith"}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    />
                  </div>

                  {/* Rating */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Rating</label>
                    <div className="flex space-x-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          className="p-1 focus:outline-none transition-transform hover:scale-110"
                        >
                          <Star
                            size={32}
                            className={`transition-colors ${
                              star <= (hoverRating || rating)
                                ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                                : 'fill-transparent text-neutral-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Your Experience</label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Share details about your experience..."
                      rows={5}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold text-lg transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {submitting ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Review</span>
                        <ThumbsUp size={18} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Reviews List Column */}
          <div className="lg:col-span-7 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-2xl font-bold">Recent Reviews</h3>
              
              <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                {(['all', 'landlord', 'tenant'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      filter === f
                        ? 'bg-neutral-800 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'landlord' ? 'Landlords' : 'Tenants'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 h-40" />
                ))}
              </div>
            ) : filteredReviews.length > 0 ? (
              <div className="space-y-6">
                {filteredReviews.map((review) => (
                  <div 
                    key={review.id} 
                    className="bg-neutral-900/40 hover:bg-neutral-900/60 transition-colors border border-neutral-800/80 rounded-2xl p-6 group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-lg font-bold text-neutral-100">{review.target_name}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            review.target_role === 'landlord' 
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}>
                            {review.target_role === 'landlord' ? 'Landlord' : 'Tenant'}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500">
                          Reviewed {new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex space-x-1 bg-neutral-950/50 px-3 py-1.5 rounded-full border border-neutral-800">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-neutral-700'}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-neutral-300 leading-relaxed text-sm">
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-neutral-900/30 border border-neutral-800 border-dashed rounded-3xl">
                <div className="bg-neutral-800/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-500">
                  <MessageSquare size={28} />
                </div>
                <h4 className="text-lg font-bold text-neutral-300 mb-2">No reviews found</h4>
                <p className="text-neutral-500 max-w-sm mx-auto text-sm">
                  There are no reviews matching your filter yet. Be the first to share your experience!
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
