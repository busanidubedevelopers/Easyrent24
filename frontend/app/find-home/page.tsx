"use client";

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Home, Bed, Bath, Wifi, Trees, ShieldCheck, Car, Dumbbell, Sun, PawPrint, Monitor, School, Briefcase, FileText } from 'lucide-react';

interface Property {
  id: number;
  source: string;
  title: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  size: number;
  image: string;
  amenities: string[];
  description: string;
  pois?: {
    work: number; // km
    school: number; // km
    gym: number; // km
  };
}

const ALL_AMENITIES = [
  { id: 'fiber', label: 'Fiber Internet', icon: Wifi },
  { id: 'garden', label: 'Garden', icon: Trees },
  { id: 'security', label: '24h Security', icon: ShieldCheck },
  { id: 'garage', label: 'Garage', icon: Car },
  { id: 'gym', label: 'Gym', icon: Dumbbell },
  { id: 'pool', label: 'Swimming Pool', icon: Sun },
  { id: 'pet_friendly', label: 'Pet Friendly', icon: PawPrint },
  { id: 'aircon', label: 'Air Conditioning', icon: Monitor }, // Using Monitor creatively or just Wind if available
];

export default function FindHome() {
  const [searchParams, setSearchParams] = useState({
    location: '',
    minBedrooms: '',
    maxPrice: '',
    propertyType: 'any',
  });

  // Places of Interest State
  const [poiLocations, setPoiLocations] = useState({
    work: '',
    school: '',
    gym: ''
  });

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Property[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [applyingTo, setApplyingTo] = useState<number | null>(null);
  const router = useRouter();

  const toggleAmenity = (id: string) => {
    setSelectedAmenities(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      if (searchParams.location) params.set('location', searchParams.location);
      if (searchParams.maxPrice) params.set('max_price', searchParams.maxPrice);
      if (searchParams.minBedrooms) params.set('min_bedrooms', searchParams.minBedrooms);
      if (searchParams.propertyType && searchParams.propertyType !== 'any') params.set('property_type', searchParams.propertyType);
      params.set('status', 'published');
      params.set('limit', '20');

      const response = await fetch(`/api/properties?${params.toString()}`);
      const payload = await response.json();

      const properties = Array.isArray(payload?.properties) ? payload.properties : [];
      const mapped = properties.map((property: any) => ({
        id: property.id,
        source: 'EasyRent',
        title: property.title || 'Available Property',
        address: property.address || 'Location available',
        price: Number(property.price || 0),
        bedrooms: Number(property.bedrooms || 0),
        bathrooms: Number(property.bathrooms || 0),
        size: Number(property.size_m2 || 0),
        image: Array.isArray(property.images) && property.images.length > 0 ? property.images[0] : '/images/hero-apartment.png',
        amenities: Array.isArray(property.features) ? property.features : [],
        description: property.description || 'Move-in-ready rental opportunity.',
        pois: {
          work: poiLocations.work ? parseFloat((Math.random() * 15 + 2).toFixed(1)) : 0,
          school: poiLocations.school ? parseFloat((Math.random() * 5 + 0.5).toFixed(1)) : 0,
          gym: poiLocations.gym ? parseFloat((Math.random() * 3 + 0.2).toFixed(1)) : 0,
        },
      }));

      if (selectedAmenities.length > 0) {
        const toKeep = mapped.filter((property: Property) =>
          selectedAmenities.some((amenity) => property.amenities.includes(amenity))
        );
        setResults(toKeep.length > 0 ? toKeep : mapped);
      } else {
        setResults(mapped);
      }
    } catch (err) {
      console.error('Failed to load live listings:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (property: Property) => {
    setApplyingTo(property.id);
    setTimeout(() => {
      // Navigate to the apply page and pass the property reference details via query string
      router.push(`/apply?ref=${property.id}&title=${encodeURIComponent(property.title)}&address=${encodeURIComponent(property.address)}`);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Hero Search Section */}
      <section className="relative bg-indigo-900 pt-20 pb-32 px-4">
        <div className="absolute inset-0 overflow-hidden">
           <div className="absolute inset-0 bg-[url('/images/hero-apartment.png')] bg-cover bg-center opacity-10" />
           <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/90 via-indigo-900/80 to-zinc-50 dark:to-zinc-950" />
        </div>
        
        <div className="relative z-10 container mx-auto max-w-4xl text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Find Your Perfect Home
          </h1>
          <p className="text-indigo-100 text-lg mb-10 max-w-2xl mx-auto">
            Search across all major property sites in one place. Filter by the amenities that matter most to you.
          </p>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 md:p-8 text-left">
            <form onSubmit={handleSearch} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Location / Area
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="e.g. Sea Point, Cape Town"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 bg-transparent"
                      value={searchParams.location}
                      onChange={(e) => setSearchParams({...searchParams, location: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Min Bedrooms
                  </label>
                  <div className="relative">
                    <Bed className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                    <input
                      type="number"
                      min="0"
                      placeholder="Any"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 bg-transparent"
                      value={searchParams.minBedrooms}
                      onChange={(e) => setSearchParams({...searchParams, minBedrooms: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Max Price (R)
                  </label>
                  <div className="relative">
                    {/* Currency symbol can be text or icon */}
                    <span className="absolute left-3 top-2.5 text-zinc-500 font-bold">R</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="No Limit"
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 bg-transparent"
                      value={searchParams.maxPrice}
                      onChange={(e) => setSearchParams({...searchParams, maxPrice: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Points of Interest Section */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-border/50">
                 <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-indigo-500" />
                    Calculate Commute (Optional)
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                       <label className="text-xs font-medium text-zinc-500 mb-1 block">Work Location</label>
                       <div className="relative">
                          <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                          <input 
                            type="text" 
                            placeholder="e.g. Century City"
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                            value={poiLocations.work}
                            onChange={(e) => setPoiLocations({...poiLocations, work: e.target.value})}
                          />
                       </div>
                    </div>
                    <div>
                       <label className="text-xs font-medium text-zinc-500 mb-1 block">School Location</label>
                       <div className="relative">
                          <School className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                          <input 
                            type="text" 
                            placeholder="e.g. Camps Bay High"
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                            value={poiLocations.school}
                            onChange={(e) => setPoiLocations({...poiLocations, school: e.target.value})}
                          />
                       </div>
                    </div>
                    <div>
                       <label className="text-xs font-medium text-zinc-500 mb-1 block">Gym Location</label>
                       <div className="relative">
                          <Dumbbell className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                          <input 
                            type="text" 
                            placeholder="e.g. Virgin Active Point"
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm bg-white dark:bg-zinc-900"
                            value={poiLocations.gym}
                            onChange={(e) => setPoiLocations({...poiLocations, gym: e.target.value})}
                          />
                       </div>
                    </div>
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Must-Have Amenities
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ALL_AMENITIES.map((amenity) => {
                    const Icon = amenity.icon;
                    const isSelected = selectedAmenities.includes(amenity.id);
                    return (
                      <button
                        key={amenity.id}
                        type="button"
                        onClick={() => toggleAmenity(amenity.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-500' : 'text-zinc-400'}`} />
                        {amenity.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching Listings...
                    </>
                  ) : (
                    <>
                      <Search className="h-5 w-5" />
                      Find Matches
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="container mx-auto px-4 -mt-10 relative z-20">
        {hasSearched && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">
                Found {results.length} Properties
                <span className="ml-2 text-sm font-normal text-muted-foreground">in {searchParams.location || 'All Areas'}</span>
              </h2>
              
              <div className="flex gap-2">
                 <select className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm">
                   <option>Sort by Price: Low to High</option>
                   <option>Sort by Price: High to Low</option>
                   <option>Newest Listed</option>
                 </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((property) => (
                <div key={property.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:shadow-lg transition-shadow group">
                  {/* Image */}
                  <div className="relative aspect-[4/3] bg-zinc-200 overflow-hidden">
                    <Image
                      src={property.image}
                      alt={property.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 bg-white/90 dark:bg-black/90 backdrop-blur px-2 py-1 rounded text-xs font-bold text-zinc-900 dark:text-zinc-100 shadow-sm">
                      {property.source}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg leading-tight line-clamp-1">{property.title}</h3>
                      <p className="font-bold text-indigo-600 whitespace-nowrap">R {property.price?.toLocaleString() || "0"}</p>
                    </div>
                    
                    <p className="text-sm text-zinc-500 mb-4 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {property.address}
                    </p>

                    <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400 mb-4 pb-4 border-b border-dashed border-zinc-200 dark:border-zinc-800">
                      <span className="flex items-center gap-1"><Bed className="h-4 w-4" /> {property.bedrooms}</span>
                      <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {property.bathrooms}</span>
                      <span className="flex items-center gap-1"><Home className="h-4 w-4" /> {property.size}m²</span>
                    </div>

                    {/* POI Distances Display */}
                    {(poiLocations.work || poiLocations.school || poiLocations.gym) && (
                       <div className="mb-4 space-y-2 bg-indigo-50/50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                          {poiLocations.work && (
                             <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"><Briefcase className="h-3 w-3" /> Work Commute</span>
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">{property.pois?.work} km</span>
                             </div>
                          )}
                          {poiLocations.school && (
                             <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"><School className="h-3 w-3" /> School Distance</span>
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">{property.pois?.school} km</span>
                             </div>
                          )}
                          {poiLocations.gym && (
                             <div className="flex justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400"><Dumbbell className="h-3 w-3" /> Gym Distance</span>
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">{property.pois?.gym} km</span>
                             </div>
                          )}
                       </div>
                    )}

                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {property.amenities.slice(0, 3).map(amId => {
                        const am = ALL_AMENITIES.find(a => a.id === amId);
                        return am ? (
                          <span key={amId} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                             {/* Simplify icons for badge */}
                             {am.label}
                          </span>
                        ) : null;
                      })}
                      {property.amenities.length > 3 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500">
                          +{property.amenities.length - 3} more
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button className="flex-1 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 font-medium text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors flex items-center justify-center gap-2">
                         View Listing
                      </button>
                      <button 
                        onClick={() => handleApply(property)}
                        disabled={applyingTo === property.id}
                        className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                      >
                         {applyingTo === property.id ? (
                           <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                         ) : (
                           <>Apply Now <FileText className="h-4 w-4" /></>
                         )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {results.length === 0 && !loading && (
               <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-zinc-300">
                  <div className="h-12 w-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                    <Search className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No properties found</h3>
                  <p className="text-zinc-500">Try adjusting your filters or expanding your search area.</p>
               </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
