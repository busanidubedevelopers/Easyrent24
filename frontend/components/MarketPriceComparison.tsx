import { useState } from 'react';
import { Search, TrendingUp, TrendingDown, Building, MapPin, Bed, ArrowRight, AlertCircle, Save } from 'lucide-react';

interface MarketPriceComparisonProps {
  formData: {
    address: string;
    price: string;
    bedrooms: string;
    bathrooms: string;
    size: string;
    propertyType?: string;
  };
}

interface ComparableProperty {
  id: string;
  address: string;
  price: number;
  bedrooms: number | null;
  propertyType: string | null;
  similarity: number;
}

interface MarketResponse {
  targetPrice: number;
  marketAverage: number | null;
  priceDiffPct: number | null;
  recommendation: { type: 'high' | 'low' | 'fair'; text: string } | null;
  comparableCount: number;
  comparables: ComparableProperty[];
}

// Moved outside to prevent re-creation on every render
const CheckCircle = ({ className }: { className?: string }) => (
  <div className={`rounded-full p-1 bg-green-100 ${className}`}>
      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
  </div>
);

export default function MarketPriceComparison({ formData }: MarketPriceComparisonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MarketResponse | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/properties/compare/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_criteria: {
            address: formData.address,
            price: formData.price,
            property_type: formData.propertyType,
            bedrooms: formData.bedrooms,
            size: formData.size
          },
          suggested_price: result.marketAverage,
          comparable_properties: result.comparables
        })
      });
      if (res.ok) {
        setSaveMessage({ text: 'Comparison saved successfully!', type: 'success' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const data = await res.json();
        setSaveMessage({ text: data.error || 'Failed to save comparison.', type: 'error' });
      }
    } catch {
      setSaveMessage({ text: 'Could not connect to the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCompare = async () => {
    if (!formData.address || !formData.price) {
      alert("Please enter at least an address and a target price to compare.");
      return;
    }

    setLoading(true);
    setSearched(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        address: formData.address,
        price: formData.price.replace(/[^0-9.]/g, ''),
      });

      if (formData.propertyType) {
        params.set('property_type', formData.propertyType);
      }
      if (formData.bedrooms) {
        params.set('bedrooms', formData.bedrooms);
      }
      if (formData.size) {
        params.set('size', formData.size.replace(/[^0-9.]/g, ''));
      }

      const res = await fetch(`/api/properties/compare?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to fetch market data.');
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error('Market comparison error:', err);
      setError('Could not connect to the market comparison service.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const currentPrice = parseFloat(formData.price.replace(/[^0-9.]/g, '')) || 0;
  const priceDiff = result?.priceDiffPct ?? 0;
  const recommendation = result?.recommendation ?? null;

  const getRecommendationIcon = () => {
    if (!recommendation) return null;
    if (recommendation.type === 'high') return TrendingDown;
    if (recommendation.type === 'low') return TrendingUp;
    return CheckCircle;
  };

  const RecommendationIcon = getRecommendationIcon();
  const recommendationColor = recommendation?.type === 'high' ? 'text-red-500' : recommendation?.type === 'low' ? 'text-green-500' : 'text-brand';

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-sm overflow-hidden mt-8">
      <div className="p-6 border-b border-border bg-zinc-50/50 dark:bg-zinc-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide">Live Data</span>
           </div>
           <h3 className="text-xl font-bold text-foreground">Market Price Validator</h3>
           <p className="text-sm text-muted-foreground">Compare your listing against published properties on EasyRent.</p>
        </div>
        <button
          onClick={handleCompare}
          disabled={loading || !formData.address}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
            loading 
              ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20'
          }`}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing Market...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Compare Price
            </>
          )}
        </button>
      </div>

      {searched && (
        <div className="p-6">
           {loading ? (
             <div className="space-y-4 animate-pulse">
               <div className="h-32 bg-zinc-100 rounded-xl" />
               <div className="h-64 bg-zinc-100 rounded-xl" />
             </div>
           ) : error ? (
             <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-4 py-3 rounded-lg flex gap-3 items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-900 dark:text-red-200">Comparison Failed</h4>
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
             </div>
           ) : result && result.comparableCount === 0 ? (
             <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-4 py-3 rounded-lg flex gap-3 items-start">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 dark:text-amber-200">Not Enough Data</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    No similar published properties were found on EasyRent to compare against. 
                    As more properties are listed in your area, market comparisons will become available.
                  </p>
                </div>
             </div>
           ) : result ? (
             <div className="space-y-8">
               {/* Actions & Save Message */}
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                 <h4 className="text-lg font-semibold">Comparison Results</h4>
                 <div className="flex items-center gap-3">
                   {saveMessage && (
                     <span className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                       {saveMessage.text}
                     </span>
                   )}
                   <button
                     onClick={handleSave}
                     disabled={saving}
                     className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${
                       saving ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed' : 'bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 shadow-sm'
                     }`}
                   >
                     {saving ? (
                       <span className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
                     ) : (
                       <Save className="w-4 h-4" />
                     )}
                     Save Comparison
                   </button>
                 </div>
               </div>
               
               {/* Analysis Result */}
               <div className="grid md:grid-cols-3 gap-6">
                 {/* Your Price Card */}
                 <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-border">
                    <p className="text-sm text-muted-foreground mb-1">Your Listing Price</p>
                    <p className="text-2xl font-bold text-foreground">
                      R {currentPrice.toLocaleString()}
                    </p>
                 </div>

                 {/* Market Average Card */}
                 <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-border">
                    <p className="text-sm text-muted-foreground mb-1">Market Average</p>
                    <p className="text-2xl font-bold text-indigo-600">
                      R {result.marketAverage?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Based on {result.comparableCount} similar {result.comparableCount === 1 ? 'property' : 'properties'}</p>
                 </div>

                 {/* Difference Card */}
                 <div className={`bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-border flex items-center justify-between ${
                   priceDiff > 0 ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : 'border-green-200 bg-green-50 dark:bg-green-900/10'
                 }`}>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Difference</p>
                      <p className={`text-2xl font-bold ${priceDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(1)}%
                      </p>
                    </div>
                    {RecommendationIcon && <RecommendationIcon className={`h-8 w-8 ${recommendationColor}`} />}
                 </div>
               </div>
               
               {/* Recommendation */}
               <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-3 rounded-lg flex gap-3 items-start">
                  <div className="bg-blue-100 dark:bg-blue-800 p-1 rounded mt-0.5">
                    <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-200">Recommendation</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">{recommendation?.text}</p>
                  </div>
               </div>

               {/* Comparables List */}
               <div>
                 <h4 className="text-lg font-semibold mb-4">Similar Properties Found</h4>
                 <div className="space-y-4">
                   {result.comparables.map((prop) => (
                     <div key={prop.id} className="group flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-border hover:border-indigo-200 transition-colors bg-white dark:bg-zinc-900">
                       <div className="relative w-full sm:w-32 h-24 rounded-lg overflow-hidden bg-zinc-200 shrink-0">
                         {/* Placeholder for Property Image */}
                         <div className="absolute inset-0 flex items-center justify-center text-zinc-400 bg-zinc-100">
                            <Building className="h-8 w-8" />
                         </div>
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-start">
                           <div>
                             <h5 className="font-semibold truncate">{prop.address}</h5>
                             <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                               {prop.bedrooms !== null && (
                                 <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" /> {prop.bedrooms}</span>
                               )}
                               {prop.propertyType && (
                                 <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" /> {prop.propertyType}</span>
                               )}
                               <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Listed</span>
                             </div>
                           </div>
                           <div className="text-right">
                             <div className="font-bold text-lg">R {prop.price.toLocaleString()}</div>
                             <div className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 inline-block mt-1 border border-zinc-200">
                               Matches {prop.similarity}%
                             </div>
                           </div>
                         </div>
                         
                         <div className="mt-3 flex items-center justify-between border-t border-dashed border-zinc-200 pt-3">
                            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                              Source: <span className="text-zinc-700 font-bold">EasyRent Listings</span>
                            </span>
                            <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 group-hover:underline">
                              View Listing <ArrowRight className="h-3 w-3" />
                            </button>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           ) : null}
        </div>
      )}
    </div>
  );
}
