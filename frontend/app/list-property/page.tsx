"use client";

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, MapPin, DollarSign, Home, Maximize, Upload, X, ImageIcon } from 'lucide-react';
import MarketPriceComparison from '@/components/MarketPriceComparison';
import { supabase } from '@/lib/supabaseClient';

export default function ListPropertyPage() {
  const [formData, setFormData] = useState({
    title: '',
    address: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    size: '',
    description: '',
    propertyType: 'apartment'
  });

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024
    );
    if (validFiles.length === 0) {
      alert('Please select valid image files (JPEG, PNG, or WebP under 5MB).');
      return;
    }
    setImageFiles(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);


  const handleSubmission = async (status: 'draft' | 'published') => {
    try {
      if (!formData.title || !formData.address || !formData.price) {
         alert("Please fill in at least the Title, Address and Price.");
         return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Fallback to local storage for demo purposes
        const existingMockStr = localStorage.getItem('mock_properties');
        const existingMock = existingMockStr ? JSON.parse(existingMockStr) : [];
        const newProperty = {
           id: "MOCK-" + Math.floor(Math.random() * 10000).toString(),
           title: formData.title,
           address: formData.address,
           price: parseFloat(formData.price) || 0,
        };
        localStorage.setItem('mock_properties', JSON.stringify([...existingMock, newProperty]));
        alert(`Listing ${status === 'published' ? 'published' : 'saved'} successfully (Demo Mode)!`);
        return;
      }

      // 1. Ensure Profile Exists (Fix for foreign key constraint)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!profileData) {
         // Create profile if missing
         const { error: createProfileError } = await supabase
            .from('profiles')
            .insert([{
               id: user.id,
               full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Landlord",
               role: 'landlord'
            }]);
         
         if (createProfileError) {
             console.error("Error creating missing profile:", createProfileError);
             throw createProfileError;
         }
      }

      // 2. Create Property
      const { data: propertyData, error } = await supabase
        .from('properties')
        .insert([
          {
            landlord_id: user.id,
            title: formData.title,
            address: formData.address,
            price: parseFloat(formData.price),
            bedrooms: parseFloat(formData.bedrooms) || 0,
            bathrooms: parseFloat(formData.bathrooms) || 0,
            size_m2: parseFloat(formData.size) || 0,
            description: formData.description,
            property_type: formData.propertyType,
            status: status
          }
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 3. Upload images if any were selected
      if (propertyData && imageFiles.length > 0) {
        for (const file of imageFiles) {
          const filePath = `${propertyData.id}/${Date.now()}_${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('property-images')
            .upload(filePath, file, { contentType: file.type });
          if (uploadError) {
            console.error('Image upload error:', uploadError);
          }
        }
      }

      alert(`Listing ${status === 'published' ? 'published' : 'saved'} successfully!`);
      // TODO: Redirect to listing page or dashboard
    } catch (error) {
      console.error('Error creating listing:', error);
      alert(`Error creating listing: ${(error as Error)?.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              List Your Property
            </h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleSubmission('draft')}
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Save Draft
            </button>
            <button 
              onClick={() => handleSubmission('published')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors shadow-lg shadow-indigo-500/20"
            >
              Publish Listing
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Property Details Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                 <h2 className="font-semibold flex items-center gap-2">
                    <Home className="h-4 w-4 text-indigo-500" />
                    Property Details
                 </h2>
              </div>
              
              <div className="p-6 grid gap-6">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Listing Title</label>
                  <input 
                    type="text" 
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="e.g. Modern 2-Bedroom Apartment in Cape Town"
                    className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-lg"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                   <div className="grid gap-2">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Property Type</label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                        <select 
                          name="propertyType"
                          value={formData.propertyType}
                          onChange={handleChange}
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black focus:ring-2 focus:ring-indigo-500 appearance-none"
                        >
                          <option value="apartment">Apartment</option>
                          <option value="house">House</option>
                          <option value="townhouse">Townhouse</option>
                          <option value="studio">Studio</option>
                        </select>
                      </div>
                   </div>
                   
                   <div className="grid gap-2">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                        <input 
                          type="text" 
                          name="address"
                          value={formData.address}
                          onChange={handleChange}
                          placeholder="Street address, Suburb"
                          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                   <div className="grid gap-2">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Bedrooms</label>
                      <input 
                        type="number" 
                        name="bedrooms"
                        min="0"
                        value={formData.bedrooms}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 text-center font-mono"
                      />
                   </div>
                   <div className="grid gap-2">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Bathrooms</label>
                      <input 
                        type="number" 
                        name="bathrooms"
                        min="0"
                        step="0.5"
                        value={formData.bathrooms}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 text-center font-mono"
                      />
                   </div>
                   <div className="grid gap-2">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                         Size
                         <span className="text-[10px] uppercase text-zinc-400">m²</span>
                      </label>
                      <div className="relative">
                        <Maximize className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                        <input 
                          type="number" 
                          name="size"
                          min="0"
                          value={formData.size}
                          onChange={handleChange}
                          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                   </div>
                </div>
              </div>
            </div>

            {/* Price Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                 <h2 className="font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    Pricing Strategy
                 </h2>
              </div>
              <div className="p-6">
                {/* Description */}
                <div className="grid gap-2 mb-6">
                   <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
                   <textarea 
                     name="description"
                     value={formData.description}
                     onChange={handleChange}
                     rows={4}
                     placeholder="Describe your property — amenities, nearby facilities, special features..."
                     className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                   />
                </div>

                {/* Image Upload Zone */}
                <div className="grid gap-2 mb-6">
                   <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                     <ImageIcon className="h-4 w-4 text-indigo-500" />
                     Property Photos
                   </label>
                   <div
                     onDrop={handleDrop}
                     onDragOver={handleDragOver}
                     onDragLeave={handleDragLeave}
                     onClick={() => fileInputRef.current?.click()}
                     className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                       isDragging
                         ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                         : 'border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                     }`}
                   >
                     <Upload className={`h-8 w-8 mb-2 ${isDragging ? 'text-indigo-500' : 'text-zinc-400'}`} />
                     <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                       {isDragging ? 'Drop images here' : 'Click to upload or drag and drop'}
                     </p>
                     <p className="text-xs text-zinc-400 mt-1">JPEG, PNG, or WebP (max 5MB each)</p>
                     <input
                       ref={fileInputRef}
                       type="file"
                       multiple
                       accept="image/jpeg,image/png,image/webp"
                       className="hidden"
                       onChange={(e) => e.target.files && addFiles(e.target.files)}
                     />
                   </div>

                   {/* Previews */}
                   {imagePreviews.length > 0 && (
                     <div className="grid grid-cols-4 gap-3 mt-3">
                       {imagePreviews.map((src, i) => (
                         <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 group">
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img src={src} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                           <button
                             type="button"
                             onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                             className="absolute top-1 right-1 h-6 w-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                           >
                             <X className="h-3 w-3" />
                           </button>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                <div className="grid gap-2 mb-6">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Monthly Rent (ZAR)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-2 text-xl font-bold text-zinc-400">R</span>
                      <input 
                        type="number" 
                        name="price"
                        value={formData.price}
                        onChange={handleChange}
                        placeholder="0.00"
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent focus:ring-2 focus:ring-indigo-500 text-2xl font-bold"
                      />
                    </div>
                </div>

                {/* THE NEW MARKET COMPARISON FEATURE */}
                <MarketPriceComparison formData={formData} />
                
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
             <div className="bg-indigo-900 rounded-xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
                <h3 className="font-bold text-lg mb-2 relative z-10">Why List with EasyRent?</h3>
                <ul className="space-y-3 text-indigo-100 text-sm relative z-10">
                   <li className="flex gap-2">
                     <span className="bg-indigo-500/50 p-1 rounded-full text-indigo-200">✓</span>
                     Verified Tenant Database
                   </li>
                   <li className="flex gap-2">
                     <span className="bg-indigo-500/50 p-1 rounded-full text-indigo-200">✓</span>
                     Automated Credit Checks
                   </li>
                   <li className="flex gap-2">
                     <span className="bg-indigo-500/50 p-1 rounded-full text-indigo-200">✓</span>
                     Handyman Integration
                   </li>
                </ul>
             </div>
             
             {/* Progress or Completion */}
             <div className="bg-white dark:bg-zinc-900 border border-zinc-200 p-6 rounded-xl">
               <h4 className="font-semibold mb-4">Listing Strength</h4>
               <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden mb-2">
                 <div className="h-full bg-orange-500 w-[30%]"></div>
               </div>
               <p className="text-xs text-muted-foreground">Add photos and description to improve your listing score.</p>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
