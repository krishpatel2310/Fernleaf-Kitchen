'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Coffee,
  List,
  Layers,
  Thermometer,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Search,
  Trash2,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react';

export default function AdminCataloguePage() {
  const [dishes, setDishes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [optionGroups, setOptionGroups] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [allergens, setAllergens] = useState<any[]>([]);
  const [dietaryTags, setDietaryTags] = useState<any[]>([]);

  // Company visibility & preview states
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companyVisibility, setCompanyVisibility] = useState<any>(null);
  const [companyEmployees, setCompanyEmployees] = useState<any[]>([]);
  const [previewEmployeeId, setPreviewEmployeeId] = useState<string>('');
  const [previewMenu, setPreviewMenu] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'dishes' | 'categories' | 'options' | 'visibility'>('dishes');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');

  // Modals state
  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<any>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);

  const [isOptionGroupModalOpen, setIsOptionGroupModalOpen] = useState(false);
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);

  // Form states for Dish
  const [dishName, setDishName] = useState('');
  const [dishDescription, setDishDescription] = useState('');
  const [dishSku, setDishSku] = useState('');
  const [dishTemperature, setDishTemperature] = useState<'HOT' | 'COLD'>('HOT');
  const [dishStationId, setDishStationId] = useState('');
  const [dishCostDollars, setDishCostDollars] = useState('');
  const [dishMoq, setDishMoq] = useState('1');
  const [selectedAllergenIds, setSelectedAllergenIds] = useState<string[]>([]);
  const [selectedDietaryTagIds, setSelectedDietaryTagIds] = useState<string[]>([]);

  // Form states for Category
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catDisplayOrder, setCatDisplayOrder] = useState('0');
  const [catIsSecret, setCatIsSecret] = useState(false);
  const [catIsActive, setCatIsActive] = useState(true);

  // Form states for Adding Dish to Category
  const [selectedDishForCat, setSelectedDishForCat] = useState<{ [catId: string]: string }>({});

  // Form states for Option Group & Option
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupIsRequired, setGroupIsRequired] = useState(true);
  const [groupDisplayOrder, setGroupDisplayOrder] = useState('0');

  const [optionName, setOptionName] = useState('');
  const [optionCostDollars, setOptionCostDollars] = useState('');
  const [optionAllergens, setOptionAllergens] = useState<string[]>([]);
  const [optionTags, setOptionTags] = useState<string[]>([]);

  const fetchCatalogue = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [dishRes, catRes, optGrpRes, optRes, stRes, alRes, dtRes, compRes] = await Promise.all([
        api.getDishes(),
        api.getMenuCategories(true).catch(() => []),
        api.getOptionGroups().catch(() => []),
        api.getOptions().catch(() => []),
        api.getKitchenStations().catch(() => []),
        api.getAllergens().catch(() => []),
        api.getDietaryTags().catch(() => []),
        api.getCompanies().catch(() => []),
      ]);

      const compList = Array.isArray(compRes) ? compRes : (compRes as any)?.data || [];
      setCompanies(compList);
      if (compList.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(compList[0].id);
      }

      setDishes(Array.isArray(dishRes) ? dishRes : (dishRes as any)?.data || []);
      setCategories(Array.isArray(catRes) ? catRes : (catRes as any)?.data || []);
      setOptionGroups(Array.isArray(optGrpRes) ? optGrpRes : (optGrpRes as any)?.data || []);
      setOptions(Array.isArray(optRes) ? optRes : (optRes as any)?.data || []);
      setStations(Array.isArray(stRes) ? stRes : []);
      setAllergens(Array.isArray(alRes) ? alRes : []);
      setDietaryTags(Array.isArray(dtRes) ? dtRes : []);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load catalogue', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanyVisibility = async (compId: string) => {
    if (!compId) return;
    try {
      const [vis, emps] = await Promise.all([
        api.getCompanyVisibility(compId),
        api.getEmployees(compId).catch(() => []),
      ]);
      setCompanyVisibility(vis);
      const empList = Array.isArray(emps) ? emps : (emps as any)?.data || [];
      setCompanyEmployees(empList);
      if (empList.length > 0) {
        setPreviewEmployeeId(empList[0].id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to fetch company menu visibility', type: 'error' });
    }
  };

  useEffect(() => {
    fetchCatalogue();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchCompanyVisibility(selectedCompanyId);
      setPreviewMenu(null);
    }
  }, [selectedCompanyId]);

  const handleToggleCompanyCategoryHide = async (categoryId: string, currentlyHidden: boolean) => {
    if (!selectedCompanyId) return;
    try {
      await api.setCompanyHiddenCategory(selectedCompanyId, categoryId, !currentlyHidden);
      setMessage({ text: `Category ${!currentlyHidden ? 'hidden' : 'unhidden'} for company`, type: 'success' });
      await fetchCompanyVisibility(selectedCompanyId);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle category visibility', type: 'error' });
    }
  };

  const handleToggleCompanyDishHide = async (dishId: string, currentlyHidden: boolean) => {
    if (!selectedCompanyId) return;
    try {
      await api.setCompanyHiddenDish(selectedCompanyId, dishId, !currentlyHidden);
      setMessage({ text: `Dish ${!currentlyHidden ? 'hidden' : 'unhidden'} for company`, type: 'success' });
      await fetchCompanyVisibility(selectedCompanyId);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle dish visibility', type: 'error' });
    }
  };

  const handleLoadPreview = async () => {
    if (!previewEmployeeId) return;
    setIsPreviewLoading(true);
    try {
      const preview = await api.getMenuPreview(previewEmployeeId);
      setPreviewMenu(preview);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load employee menu preview', type: 'error' });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const formatCents = (cents: number = 0) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // ---------------------------------------------------------------------------
  // DISH ACTIONS
  // ---------------------------------------------------------------------------
  const openCreateDish = () => {
    setEditingDish(null);
    setDishName('');
    setDishDescription('');
    setDishSku('');
    setDishTemperature('HOT');
    setDishStationId(stations[0]?.id || '');
    setDishCostDollars('');
    setDishMoq('1');
    setSelectedAllergenIds([]);
    setSelectedDietaryTagIds([]);
    setIsDishModalOpen(true);
  };

  const openEditDish = (dish: any) => {
    setEditingDish(dish);
    setDishName(dish.name || '');
    setDishDescription(dish.description || '');
    setDishSku(dish.sku || '');
    setDishTemperature(dish.temperature || 'HOT');
    setDishStationId(dish.kitchenStationId || dish.kitchenStation?.id || '');
    setDishCostDollars((dish.costPriceCents / 100).toFixed(2));
    setDishMoq(String(dish.minimumOrderQuantity || 1));
    setSelectedAllergenIds(dish.allergens?.map((a: any) => a.allergenId || a.id) || []);
    setSelectedDietaryTagIds(dish.dietaryTags?.map((d: any) => d.dietaryTagId || d.id) || []);
    setIsDishModalOpen(true);
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const costCents = Math.round(parseFloat(dishCostDollars || '0') * 100);
      const payload: any = {
        name: dishName.trim(),
        description: dishDescription.trim() || undefined,
        sku: dishSku.trim().toUpperCase(),
        temperature: dishTemperature,
        costPriceCents: costCents,
        minimumOrderQuantity: parseInt(dishMoq, 10) || 1,
        kitchenStationId: dishStationId || undefined,
        allergenIds: selectedAllergenIds,
        dietaryTagIds: selectedDietaryTagIds,
      };

      if (editingDish) {
        await api.updateDish(editingDish.id, payload);
        setMessage({ text: `Dish '${payload.name}' updated successfully!`, type: 'success' });
      } else {
        await api.createDish(payload);
        setMessage({ text: `Dish '${payload.name}' created successfully!`, type: 'success' });
      }

      setIsDishModalOpen(false);
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save dish', type: 'error' });
    }
  };

  const handleToggleDishActive = async (dish: any) => {
    try {
      if (dish.isActive) {
        await api.deactivateDish(dish.id);
        setMessage({ text: `Dish '${dish.name}' deactivated`, type: 'success' });
      } else {
        await api.activateDish(dish.id);
        setMessage({ text: `Dish '${dish.name}' activated`, type: 'success' });
      }
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle dish status', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // CATEGORY ACTIONS
  // ---------------------------------------------------------------------------
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatDescription('');
    setCatDisplayOrder('0');
    setCatIsSecret(false);
    setCatIsActive(true);
    setIsCategoryModalOpen(true);
  };

  const openEditCategory = (cat: any) => {
    setEditingCategory(cat);
    setCatName(cat.name || '');
    setCatDescription(cat.description || '');
    setCatDisplayOrder(String(cat.displayOrder || 0));
    setCatIsSecret(Boolean(cat.isSecret));
    setCatIsActive(Boolean(cat.isActive));
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: catName.trim(),
        description: catDescription.trim() || undefined,
        displayOrder: parseInt(catDisplayOrder, 10) || 0,
        isSecret: catIsSecret,
        isActive: catIsActive,
      };

      if (editingCategory) {
        await api.updateCategory(editingCategory.id, payload);
        setMessage({ text: `Category '${payload.name}' updated!`, type: 'success' });
      } else {
        await api.createCategory(payload);
        setMessage({ text: `Category '${payload.name}' created!`, type: 'success' });
      }

      setIsCategoryModalOpen(false);
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save category', type: 'error' });
    }
  };

  const handleAddDishToCategory = async (categoryId: string) => {
    const dishId = selectedDishForCat[categoryId];
    if (!dishId) return;
    try {
      await api.addDishToCategory(categoryId, { dishId });
      setMessage({ text: 'Dish added to category successfully!', type: 'success' });
      setSelectedDishForCat((prev) => ({ ...prev, [categoryId]: '' }));
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add dish to category', type: 'error' });
    }
  };

  const handleRemoveDishFromCategory = async (categoryId: string, dishId: string) => {
    if (!confirm('Remove this dish from the menu category?')) return;
    try {
      await api.removeDishFromCategory(categoryId, dishId);
      setMessage({ text: 'Dish removed from category', type: 'success' });
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to remove dish', type: 'error' });
    }
  };

  const handleToggleMenuItemActive = async (categoryId: string, dishId: string, currentActive: boolean) => {
    try {
      await api.toggleMenuItemActive(categoryId, dishId, !currentActive);
      setMessage({ text: `Menu item ${!currentActive ? 'activated' : 'deactivated'} in category`, type: 'success' });
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle menu item status', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // OPTION GROUP & OPTION ACTIONS
  // ---------------------------------------------------------------------------
  const handleSaveOptionGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createOptionGroup({
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        isRequired: groupIsRequired,
        displayOrder: parseInt(groupDisplayOrder, 10) || 0,
      });
      setMessage({ text: `Option group '${groupName}' created!`, type: 'success' });
      setGroupName('');
      setGroupDescription('');
      setIsOptionGroupModalOpen(false);
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create option group', type: 'error' });
    }
  };

  const handleToggleOptionGroupActive = async (group: any) => {
    try {
      if (group.isActive) {
        await api.deactivateOptionGroup(group.id);
        setMessage({ text: `Option group '${group.name}' deactivated`, type: 'success' });
      } else {
        await api.activateOptionGroup(group.id);
        setMessage({ text: `Option group '${group.name}' activated`, type: 'success' });
      }
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle option group', type: 'error' });
    }
  };

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const costCents = Math.round(parseFloat(optionCostDollars || '0') * 100);
      await api.createOption({
        name: optionName.trim(),
        costPriceCents: costCents,
        allergenIds: optionAllergens,
        dietaryTagIds: optionTags,
      });
      setMessage({ text: `Option '${optionName}' created!`, type: 'success' });
      setOptionName('');
      setOptionCostDollars('');
      setOptionAllergens([]);
      setOptionTags([]);
      setIsOptionModalOpen(false);
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create option', type: 'error' });
    }
  };

  const handleToggleOptionActive = async (opt: any) => {
    try {
      if (opt.isActive) {
        await api.deactivateOption(opt.id);
        setMessage({ text: `Option '${opt.name}' deactivated`, type: 'success' });
      } else {
        await api.activateOption(opt.id);
        setMessage({ text: `Option '${opt.name}' activated`, type: 'success' });
      }
      await fetchCatalogue();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to toggle option', type: 'error' });
    }
  };

  // Filtered dishes
  const filteredDishes = dishes.filter((dish) => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      dish.name?.toLowerCase().includes(q) ||
      dish.sku?.toLowerCase().includes(q) ||
      dish.description?.toLowerCase().includes(q);
    const matchActive =
      filterActive === 'all'
        ? true
        : filterActive === 'active'
        ? dish.isActive
        : !dish.isActive;
    return matchQuery && matchActive;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Coffee className="h-6 w-6 text-emerald-400" />
              <span>Catalogue & Menu Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Real administrative operations for catalogue dishes, menu categories, category dish assignments, and option groups.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setActiveTab('dishes')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'dishes' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dishes ({dishes.length})
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'categories' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Categories ({categories.length})
              </button>
              <button
                onClick={() => setActiveTab('options')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'options' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Options & Groups ({options.length}/{optionGroups.length})
              </button>
              <button
                onClick={() => setActiveTab('visibility')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'visibility' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Company Visibility & Preview
              </button>
            </div>

            <button
              onClick={fetchCatalogue}
              title="Refresh catalogue data"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-medium ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border-red-800 text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: DISHES */}
        {/* ========================================================================= */}
        {activeTab === 'dishes' && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
              <div className="flex flex-1 items-center space-x-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search dishes by name or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <select
                  value={filterActive}
                  onChange={(e) => setFilterActive(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="all">All Dishes</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Deactivated Only</option>
                </select>
              </div>

              <button
                onClick={openCreateDish}
                className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition shadow"
              >
                <Plus className="h-4 w-4" />
                <span>Create Catalogue Dish</span>
              </button>
            </div>

            {isLoading && dishes.length === 0 ? (
              <div className="py-24 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>
            ) : filteredDishes.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl">
                <Coffee className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-300">No dishes match criteria</div>
                <p className="text-xs text-slate-500 mt-1">Try adjusting search or create a new dish.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDishes.map((dish) => (
                  <div
                    key={dish.id}
                    className={`bg-slate-900/80 border rounded-2xl p-5 transition flex flex-col justify-between ${
                      dish.isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-70'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-bold text-white text-base">{dish.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            SKU: {dish.sku} • {dish.temperature}
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            dish.isActive
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {dish.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      {dish.description && (
                        <p className="text-xs text-slate-300 mt-2 line-clamp-2">{dish.description}</p>
                      )}

                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Station:</span>
                          <span className="font-semibold text-slate-200">
                            {dish.kitchenStation?.name || 'Unassigned'}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-400">Cost Price:</span>
                          <span className="font-mono text-slate-300">{formatCents(dish.costPriceCents)}</span>
                        </div>

                        {dish.minimumOrderQuantity && dish.minimumOrderQuantity > 1 && (
                          <div className="flex justify-between text-amber-300">
                            <span>MOQ:</span>
                            <span className="font-bold">{dish.minimumOrderQuantity} units</span>
                          </div>
                        )}

                        {dish.allergens && dish.allergens.length > 0 && (
                          <div className="pt-1 flex flex-wrap gap-1">
                            {dish.allergens.map((a: any) => (
                              <span key={a.id || a.allergenId} className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 text-[10px]">
                                {a.allergen?.name || a.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {dish.dietaryTags && dish.dietaryTags.length > 0 && (
                          <div className="pt-1 flex flex-wrap gap-1">
                            {dish.dietaryTags.map((d: any) => (
                              <span key={d.id || d.dietaryTagId} className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 text-[10px]">
                                {d.dietaryTag?.name || d.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <button
                        onClick={() => openEditDish(dish)}
                        className="py-1 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1 transition"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit Dish</span>
                      </button>

                      <button
                        onClick={() => handleToggleDishActive(dish)}
                        className={`py-1 px-3 rounded-lg text-xs font-medium transition ${
                          dish.isActive
                            ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300'
                            : 'bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300'
                        }`}
                      >
                        {dish.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MENU CATEGORIES */}
        {/* ========================================================================= */}
        {activeTab === 'categories' && (
          <div className="mt-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  Menu Categories ({categories.length})
                </h2>
                <p className="text-xs text-slate-500">Categories display dishes to corporate employees.</p>
              </div>

              <button
                onClick={openCreateCategory}
                className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
              >
                <Plus className="h-4 w-4" />
                <span>Create Menu Category</span>
              </button>
            </div>

            <div className="space-y-4">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-800 gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base">{cat.name}</span>
                        {cat.isSecret && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            Secret Category
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            cat.isActive
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {cat.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 mt-1">
                        Display Order: {cat.displayOrder} • {cat.description || 'No description'}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditCategory(cat)}
                        className="py-1 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1 transition"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>

                  {/* Category Items */}
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Dishes in this Category ({cat.items?.length || 0})
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {(cat.items || []).map((item: any) => {
                        const dish = item.dish || item;
                        return (
                          <div
                            key={item.id || item.dishId}
                            className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs flex justify-between items-center"
                          >
                            <div>
                              <div className="font-semibold text-white">{dish.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">SKU: {dish.sku}</div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleToggleMenuItemActive(cat.id, dish.id, item.isActive !== false)}
                                title={item.isActive !== false ? 'Deactivate in category' : 'Activate in category'}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  item.isActive !== false
                                    ? 'bg-emerald-950 text-emerald-300'
                                    : 'bg-slate-800 text-slate-500'
                                }`}
                              >
                                {item.isActive !== false ? 'Active' : 'Inactive'}
                              </button>

                              <button
                                onClick={() => handleRemoveDishFromCategory(cat.id, dish.id)}
                                title="Remove dish from category"
                                className="text-slate-500 hover:text-rose-400 transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Dish Form */}
                    <div className="mt-3 flex items-center space-x-2 max-w-md">
                      <select
                        value={selectedDishForCat[cat.id] || ''}
                        onChange={(e) => setSelectedDishForCat({ ...selectedDishForCat, [cat.id]: e.target.value })}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Select dish to add...</option>
                        {dishes.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.sku})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleAddDishToCategory(cat.id)}
                        disabled={!selectedDishForCat[cat.id]}
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs disabled:opacity-50 transition"
                      >
                        Add Dish
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: OPTIONS & GROUPS */}
        {/* ========================================================================= */}
        {activeTab === 'options' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Option Groups */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span>Option Groups ({optionGroups.length})</span>
                </h3>

                <button
                  onClick={() => setIsOptionGroupModalOpen(true)}
                  className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1 transition shadow"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Group</span>
                </button>
              </div>

              <div className="space-y-3">
                {optionGroups.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">{g.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                          {g.isRequired ? 'Required' : 'Optional'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Order: {g.displayOrder} • {g.options?.length || 0} options
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleOptionGroupActive(g)}
                      className={`text-[10px] px-2 py-1 rounded font-semibold transition ${
                        g.isActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {g.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Reusable Options */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <List className="h-4 w-4 text-purple-400" />
                  <span>Reusable Options ({options.length})</span>
                </h3>

                <button
                  onClick={() => setIsOptionModalOpen(true)}
                  className="py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1 transition shadow"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Option</span>
                </button>
              </div>

              <div className="space-y-3">
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold text-white">{opt.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Cost: {formatCents(opt.costPriceCents)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleOptionActive(opt)}
                      className={`text-[10px] px-2 py-1 rounded font-semibold transition ${
                        opt.isActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {opt.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: COMPANY VISIBILITY & PREVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'visibility' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-emerald-400" />
                  <span>Company-Specific Menu Filtering & Preview</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure which menu categories and individual dishes are hidden for specific client companies, and preview employee menus.
                </p>
              </div>

              <div className="flex items-center space-x-3 w-full md:w-auto">
                <label className="text-xs text-slate-400 font-medium whitespace-nowrap">Select Company:</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domains?.map((d: any) => d.domain).join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Visibility Grids */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Hiding */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    <span>Category Visibility</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {companyVisibility?.hiddenCategories?.length || 0} Hidden
                  </span>
                </div>

                <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
                  {categories.map((cat) => {
                    const isHidden = companyVisibility?.hiddenCategories?.some(
                      (hc: any) => hc.categoryId === cat.id
                    );
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white flex items-center space-x-2">
                            <span>{cat.name}</span>
                            {cat.isSecret && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                Secret
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">{cat.dishes?.length || 0} dishes</div>
                        </div>

                        <button
                          onClick={() => handleToggleCompanyCategoryHide(cat.id, !!isHidden)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition ${
                            isHidden
                              ? 'bg-red-950/80 text-red-300 border border-red-800 hover:bg-red-900'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                          }`}
                        >
                          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span>{isHidden ? 'Hidden' : 'Visible'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dish Hiding */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Coffee className="h-4 w-4 text-emerald-400" />
                    <span>Dish Visibility</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {companyVisibility?.hiddenDishes?.length || 0} Hidden
                  </span>
                </div>

                <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
                  {dishes.map((dish) => {
                    const isHidden = companyVisibility?.hiddenDishes?.some(
                      (hd: any) => hd.dishId === dish.id
                    );
                    return (
                      <div
                        key={dish.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{dish.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            SKU: {dish.sku} | Cost: {formatCents(dish.costCents)}
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleCompanyDishHide(dish.id, !!isHidden)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition ${
                            isHidden
                              ? 'bg-red-950/80 text-red-300 border border-red-800 hover:bg-red-900'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                          }`}
                        >
                          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span>{isHidden ? 'Hidden' : 'Visible'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Employee Menu Live Preview */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-800 gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Search className="h-4 w-4 text-emerald-400" />
                    <span>Employee Menu Live Preview</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Preview the exact menu seen by an employee, accounting for company-specific pricing tier, allergen warnings, and hidden items.
                  </p>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <select
                    value={previewEmployeeId}
                    onChange={(e) => setPreviewEmployeeId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {companyEmployees.length === 0 && <option value="">No employees found</option>}
                    {companyEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.email})
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleLoadPreview}
                    disabled={!previewEmployeeId || isPreviewLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                    <span>Preview Menu</span>
                  </button>
                </div>
              </div>

              {previewMenu && (
                <div className="mt-5 space-y-4">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-wrap gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Employee: </span>
                      <span className="text-white font-medium">
                        {previewMenu.employee?.firstName} {previewMenu.employee?.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Company: </span>
                      <span className="text-emerald-400 font-medium">
                        {previewMenu.company?.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Price Tier: </span>
                      <span className="text-cyan-400 font-medium">
                        {previewMenu.priceTier?.name || 'Default Tier'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {previewMenu.categories?.map((cat: any) => (
                      <div key={cat.id} className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                        <div className="font-bold text-xs text-white border-b border-slate-800 pb-2 flex justify-between items-center">
                          <span>{cat.name}</span>
                          <span className="text-[10px] text-slate-500">{cat.dishes?.length || 0} items</span>
                        </div>
                        <div className="space-y-2">
                          {cat.dishes?.map((d: any) => (
                            <div
                              key={d.id}
                              className={`p-2.5 rounded-lg border text-xs ${
                                d.isAllergyWarning
                                  ? 'bg-amber-950/20 border-amber-800/40 text-slate-300'
                                  : 'bg-slate-900/60 border-slate-800/80 text-white'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="font-medium text-xs">{d.name}</span>
                                <span className="text-emerald-400 font-mono font-semibold">
                                  {formatCents(d.priceCents)}
                                </span>
                              </div>
                              {d.isAllergyWarning && (
                                <div className="text-[10px] text-amber-400 mt-1 flex items-center space-x-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>Contains allergen matching employee profile</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE / EDIT DISH */}
        {/* ========================================================================= */}
        {isDishModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">
                  {editingDish ? `Edit Dish: ${editingDish.name}` : 'Create Catalogue Dish'}
                </h3>
                <button
                  onClick={() => setIsDishModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveDish} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Dish Name *</label>
                  <input
                    type="text"
                    required
                    value={dishName}
                    onChange={(e) => setDishName(e.target.value)}
                    placeholder="e.g. Artisanal Sourdough Sandwich"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={dishDescription}
                    onChange={(e) => setDishDescription(e.target.value)}
                    placeholder="Culinary preparation details..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">SKU *</label>
                    <input
                      type="text"
                      required
                      value={dishSku}
                      onChange={(e) => setDishSku(e.target.value.toUpperCase())}
                      placeholder="e.g. SND-001"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Temperature *</label>
                    <select
                      value={dishTemperature}
                      onChange={(e) => setDishTemperature(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="HOT">HOT</option>
                      <option value="COLD">COLD</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Cost Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={dishCostDollars}
                      onChange={(e) => setDishCostDollars(e.target.value)}
                      placeholder="e.g. 8.50"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Minimum Order Qty (MOQ)</label>
                    <input
                      type="number"
                      min="1"
                      value={dishMoq}
                      onChange={(e) => setDishMoq(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Kitchen Station</label>
                  <select
                    value={dishStationId}
                    onChange={(e) => setDishStationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">No Station Assigned</option>
                    {stations.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Allergens selection */}
                {allergens.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Allergens</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 border border-slate-800 rounded-lg max-h-24 overflow-y-auto">
                      {allergens.map((a) => {
                        const isChecked = selectedAllergenIds.includes(a.id);
                        return (
                          <button
                            type="button"
                            key={a.id}
                            onClick={() =>
                              setSelectedAllergenIds((prev) =>
                                isChecked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                              )
                            }
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              isChecked
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dietary Tags selection */}
                {dietaryTags.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Dietary Tags</label>
                    <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 border border-slate-800 rounded-lg max-h-24 overflow-y-auto">
                      {dietaryTags.map((dt) => {
                        const isChecked = selectedDietaryTagIds.includes(dt.id);
                        return (
                          <button
                            type="button"
                            key={dt.id}
                            onClick={() =>
                              setSelectedDietaryTagIds((prev) =>
                                isChecked ? prev.filter((id) => id !== dt.id) : [...prev, dt.id]
                              )
                            }
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              isChecked
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {dt.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsDishModalOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    {editingDish ? 'Save Changes' : 'Create Dish'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE / EDIT CATEGORY */}
        {/* ========================================================================= */}
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">
                  {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Create Menu Category'}
                </h3>
                <button
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveCategory} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category Name *</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g. Gourmet Sandwiches"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={catDescription}
                    onChange={(e) => setCatDescription(e.target.value)}
                    placeholder="Category summary..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="0"
                    value={catDisplayOrder}
                    onChange={(e) => setCatDisplayOrder(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center space-x-6 text-xs text-slate-300">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catIsSecret}
                      onChange={(e) => setCatIsSecret(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Secret Category</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catIsActive}
                      onChange={(e) => setCatIsActive(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Active Status</span>
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    {editingCategory ? 'Save Changes' : 'Create Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE OPTION GROUP */}
        {/* ========================================================================= */}
        {isOptionGroupModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Create Option Group</h3>
                <button
                  onClick={() => setIsOptionGroupModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveOptionGroup} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Group Name *</label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Choice of Bread"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Instructions for employee selection..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Display Order</label>
                    <input
                      type="number"
                      min="0"
                      value={groupDisplayOrder}
                      onChange={(e) => setGroupDisplayOrder(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={groupIsRequired}
                        onChange={(e) => setGroupIsRequired(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Is Required?</span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsOptionGroupModalOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Create Group
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE OPTION */}
        {/* ========================================================================= */}
        {isOptionModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Create Reusable Option</h3>
                <button
                  onClick={() => setIsOptionModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveOption} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Option Name *</label>
                  <input
                    type="text"
                    required
                    value={optionName}
                    onChange={(e) => setOptionName(e.target.value)}
                    placeholder="e.g. Gluten-Free Sourdough"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cost Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={optionCostDollars}
                    onChange={(e) => setOptionCostDollars(e.target.value)}
                    placeholder="e.g. 1.50"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsOptionModalOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
                  >
                    Create Option
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
