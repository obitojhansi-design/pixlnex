// supabase.js - Complete Pixlnex Supabase Configuration
// ⚠️ REPLACE WITH YOUR ACTUAL CREDENTIALS

const SUPABASE_URL = 'https://mskhicltjsnjitwfswis.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5dgWT5HaVjV6PaEpOrhcWw_6DUUC4uY';
const SUPABASE_BUCKET = 'product-images';

let supabaseClient = null;
let supabaseConnected = false;
let useFallback = false;

console.log('🚀 supabase.js loaded');

// ─── FALLBACK DATA ───
const FALLBACK_PRODUCTS = [
  { id: 1, name: 'Portfolio Web', description: 'A sleek personal portfolio to showcase your work.', price: 34999, icon: 'fa-user-tie', features: ['1–5 pages', 'Contact form', 'Social links', 'Responsive design'], image_urls: [], category: 'portfolio', category_label: 'Portfolio' },
  { id: 2, name: 'Business Web', description: 'Professional website for your business or startup.', price: 59999, icon: 'fa-building', features: ['5–10 pages', 'Contact form', 'Google Maps', 'Newsletter signup', 'Responsive design'], image_urls: [], category: 'business', category_label: 'Business' },
  { id: 3, name: 'E‑commerce Web', description: 'Full online store with product management.', price: 89999, icon: 'fa-store', features: ['Product catalog', 'Shopping cart', 'Checkout', 'Payment integration', 'Admin panel'], image_urls: [], category: 'ecommerce', category_label: 'E‑commerce' },
  { id: 4, name: 'Custom Web', description: 'Tell me exactly what you want — I\'ll build it.', price: 49999, icon: 'fa-pencil-ruler', features: ['Fully custom design', 'Any features you need', 'Built from scratch', 'You own the code'], image_urls: [], category: 'custom', category_label: 'Custom' }
];

// ─── INIT SUPABASE ───
function initSupabase() {
  try {
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseConnected = true;
      useFallback = false;
      console.log('✅ Supabase connected successfully');
      console.log('📍 URL:', SUPABASE_URL);
      return supabaseClient;
    } else {
      console.warn('⚠️ Supabase SDK not loaded, using fallback mode');
      supabaseConnected = false;
      useFallback = true;
      return null;
    }
  } catch (e) {
    console.warn('⚠️ Supabase connection error, using fallback mode:', e.message);
    supabaseConnected = false;
    useFallback = true;
    return null;
  }
}

// ─── HELPER: Format PKR ───
function formatPKR(amount) {
  return '₨ ' + (amount || 0).toLocaleString('en-PK');
}

// ─── AUTH FUNCTIONS ───

// Sign Up User
async function signUpUser(email, password, userData) {
  if (!supabaseConnected || !supabaseClient) {
    console.log('📦 Using fallback signup (localStorage)');
    const users = JSON.parse(localStorage.getItem('pixlnex_users') || '[]');
    
    if (users.find(u => u.email === email)) {
      return { success: false, error: 'User already exists. Please login.' };
    }
    
    const newUser = {
      id: 'user_' + Date.now(),
      name: userData.full_name || userData.name || 'User',
      email: email,
      password: password,
      created_at: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem('pixlnex_users', JSON.stringify(users));
    localStorage.setItem('pixlnex_user', JSON.stringify({ name: newUser.name, email: newUser.email }));
    
    return { success: true, user: newUser, autoLogin: true };
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: userData.full_name || userData.name
        }
      }
    });

    if (error) {
      if (error.message && error.message.includes('rate limit')) {
        return { 
          success: false, 
          error: 'Too many signup attempts. Please wait 1 hour and try again.'
        };
      }
      throw error;
    }

    if (data.user) {
      try {
        await supabaseClient
          .from('users')
          .insert([{
            id: data.user.id,
            name: userData.full_name || userData.name,
            email: email,
            created_at: new Date().toISOString()
          }]);
      } catch (e) {
        console.warn('Could not create user record:', e);
      }

      const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (sessionError) {
        return { success: true, user: data.user, autoLogin: false };
      }

      return { success: true, user: sessionData.user, autoLogin: true };
    }

    return { success: true, user: data.user, autoLogin: false };
  } catch (e) {
    console.error('Signup error:', e);
    return { success: false, error: e.message };
  }
}

// Sign In User
async function signInUser(email, password) {
  if (!supabaseConnected || !supabaseClient) {
    console.log('📦 Using fallback login (localStorage)');
    const users = JSON.parse(localStorage.getItem('pixlnex_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      localStorage.setItem('pixlnex_user', JSON.stringify({ name: user.name, email: user.email }));
      return { success: true, user: user };
    }
    
    if (email === 'demo@pixlnex.com' && password === 'password123') {
      localStorage.setItem('pixlnex_user', JSON.stringify({ name: 'Demo User', email: 'demo@pixlnex.com' }));
      return { success: true, user: { name: 'Demo User', email: 'demo@pixlnex.com' } };
    }
    
    return { success: false, error: 'Invalid email or password' };
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      if (error.message && error.message.includes('Email not confirmed')) {
        return { success: false, error: 'Please confirm your email. Check your inbox.' };
      }
      if (error.message && error.message.includes('Invalid login credentials')) {
        return { success: false, error: 'Invalid email or password. Please try again.' };
      }
      if (error.message && error.message.includes('rate limit')) {
        return { success: false, error: 'Too many login attempts. Please wait a few minutes.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true, user: data.user };
  } catch (e) {
    console.error('Login error:', e);
    return { success: false, error: e.message };
  }
}

// Sign Out User
async function signOutUser() {
  localStorage.removeItem('pixlnex_user');
  
  if (supabaseConnected && supabaseClient) {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    } catch (e) {
      console.error('Logout error:', e);
    }
  }
  return { success: true };
}

// Get Current User
async function getCurrentUser() {
  const localUser = JSON.parse(localStorage.getItem('pixlnex_user') || 'null');
  if (localUser) {
    return { user_metadata: { full_name: localUser.name }, email: localUser.email };
  }
  
  if (!supabaseConnected || !supabaseClient) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (e) {
    console.error('User error:', e);
    return null;
  }
}

// ─── PRODUCT FUNCTIONS ───

// Get All Products
async function getProducts() {
  if (!supabaseConnected || !supabaseClient) {
    console.log('📦 Using fallback products (localStorage)');
    const saved = localStorage.getItem('pixlnex_products');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return FALLBACK_PRODUCTS;
  }

  try {
    console.log('🔍 Fetching products from Supabase...');
    const { data, error } = await supabaseClient
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Products error:', error);
      const saved = localStorage.getItem('pixlnex_products');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
      return FALLBACK_PRODUCTS;
    }
    
    console.log('✅ Products loaded:', data?.length || 0);
    
    if (data && data.length > 0) {
      localStorage.setItem('pixlnex_products', JSON.stringify(data));
    }
    
    return data || [];
  } catch (e) {
    console.error('❌ Error fetching products:', e);
    const saved = localStorage.getItem('pixlnex_products');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {}
    }
    return FALLBACK_PRODUCTS;
  }
}

// Add Product
async function addProduct(productData, imageFile) {
  if (!supabaseConnected || !supabaseClient) {
    console.log('📦 Saving product to localStorage (fallback)');
    const products = JSON.parse(localStorage.getItem('pixlnex_products') || '[]');
    const newProduct = {
      id: Date.now(),
      ...productData,
      created_at: new Date().toISOString()
    };
    products.push(newProduct);
    localStorage.setItem('pixlnex_products', JSON.stringify(products));
    return newProduct;
  }

  try {
    let imageUrls = [];

    if (imageFile) {
      // Upload single image
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(filePath);

      imageUrls = [urlData.publicUrl];
    }

    // If multiple images are passed as array
    if (productData.image_files && Array.isArray(productData.image_files)) {
      const urls = [];
      for (const file of productData.image_files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabaseClient.storage
          .from(SUPABASE_BUCKET)
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(filePath);

        urls.push(urlData.publicUrl);
      }
      imageUrls = urls;
    }

    const { data, error } = await supabaseClient
      .from('products')
      .insert([{
        name: productData.name,
        description: productData.desc || productData.description,
        price: productData.price,
        icon: productData.icon || 'fa-cube',
        category: productData.category || 'custom',
        category_label: productData.category_label || 'Custom',
        features: productData.features || [],
        image_urls: imageUrls,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } catch (e) {
    console.error('Error adding product:', e);
    throw e;
  }
}

// Update Product
async function updateProduct(productId, updates) {
  if (!supabaseConnected || !supabaseClient) {
    const products = JSON.parse(localStorage.getItem('pixlnex_products') || '[]');
    const index = products.findIndex(p => p.id === productId);
    if (index !== -1) {
      products[index] = { ...products[index], ...updates };
      localStorage.setItem('pixlnex_products', JSON.stringify(products));
      return products[index];
    }
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } catch (e) {
    console.error('Error updating product:', e);
    throw e;
  }
}

// Delete Product
async function deleteProduct(productId, imagePath) {
  if (!supabaseConnected || !supabaseClient) {
    let products = JSON.parse(localStorage.getItem('pixlnex_products') || '[]');
    products = products.filter(p => p.id !== productId);
    localStorage.setItem('pixlnex_products', JSON.stringify(products));
    return true;
  }

  try {
    if (imagePath) {
      await supabaseClient.storage
        .from(SUPABASE_BUCKET)
        .remove([imagePath]);
    }

    const { error } = await supabaseClient
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error deleting product:', e);
    throw e;
  }
}

// ─── ORDER FUNCTIONS ───

// Get All Orders
async function getOrders() {
  if (!supabaseConnected || !supabaseClient) {
    return JSON.parse(localStorage.getItem('pixlnex_orders') || '[]');
  }

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    if (data && data.length > 0) {
      localStorage.setItem('pixlnex_orders', JSON.stringify(data));
    }
    
    return data || [];
  } catch (e) {
    console.error('Error fetching orders:', e);
    return JSON.parse(localStorage.getItem('pixlnex_orders') || '[]');
  }
}

// Get Orders for a Specific User
async function getUserOrders(email) {
  if (!supabaseConnected || !supabaseClient) {
    const orders = JSON.parse(localStorage.getItem('pixlnex_orders') || '[]');
    return orders.filter(o => o.customer_email === email);
  }

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching user orders:', e);
    return [];
  }
}

// Create Order
async function createOrder(orderData) {
  if (!supabaseConnected || !supabaseClient) {
    const orders = JSON.parse(localStorage.getItem('pixlnex_orders') || '[]');
    const newOrder = {
      id: Date.now(),
      order_id: '#ORD-' + Date.now().toString().slice(-6),
      ...orderData,
      payment_status: orderData.payment_status || 'pending',
      is_custom: orderData.is_custom || false,
      created_at: new Date().toISOString()
    };
    orders.push(newOrder);
    localStorage.setItem('pixlnex_orders', JSON.stringify(orders));
    return newOrder;
  }

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .insert([{
        order_id: '#ORD-' + Date.now().toString().slice(-6),
        name: orderData.name,
        price: orderData.price,
        customer_email: orderData.customer_email,
        customer_name: orderData.customer_name,
        payment_method: orderData.payment_method || 'jazzcash',
        payment_status: orderData.payment_status || 'pending',
        status: orderData.status || 'processing',
        is_custom: orderData.is_custom || false,
        order_type: orderData.order_type || (orderData.is_custom ? 'custom' : 'premade'),
        // Custom fields
        custom_details: orderData.custom_details || '',
        custom_type: orderData.custom_type || '',
        custom_budget: orderData.custom_budget || '',
        website_goal: orderData.website_goal || '',
        target_audience: orderData.target_audience || '',
        design_preference: orderData.design_preference || '',
        pages_needed: orderData.pages_needed || '',
        features_needed: orderData.features_needed || '',
        color_scheme: orderData.color_scheme || '',
        content_ready: orderData.content_ready || '',
        deadline: orderData.deadline || '',
        additional_notes: orderData.additional_notes || '',
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } catch (e) {
    console.error('Error creating order:', e);
    throw e;
  }
}

// Update Order Status
async function updateOrderStatus(orderId, newStatus) {
  if (!supabaseConnected || !supabaseClient) {
    const orders = JSON.parse(localStorage.getItem('pixlnex_orders') || '[]');
    const index = orders.findIndex(o => (o.id || o.order_id) == orderId);
    if (index !== -1) {
      orders[index].status = newStatus;
      localStorage.setItem('pixlnex_orders', JSON.stringify(orders));
      return orders[index];
    }
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } catch (e) {
    console.error('Error updating order:', e);
    throw e;
  }
}

// ─── OFFER FUNCTIONS ───

// Get Offer Status
async function getOfferStatus(offerType) {
  if (!supabaseConnected || !supabaseClient) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('offer_type', offerType)
      .single();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Error fetching offer:', e);
    return null;
  }
}

// Claim Offer
async function claimOffer(offerType, email) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }

  try {
    // Get current offer
    const { data, error } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('offer_type', offerType)
      .single();

    if (error) throw error;

    if (!data || data.is_active === false) {
      throw new Error('This offer is no longer active');
    }

    const claimedArray = data.claimed_by ? data.claimed_by.split(',').filter(Boolean) : [];

    if (claimedArray.includes(email)) {
      throw new Error('You have already claimed this offer');
    }

    if (claimedArray.length >= data.total_limit) {
      throw new Error('Offer fully claimed');
    }

    claimedArray.push(email);
    const { error: updateError } = await supabaseClient
      .from('offers')
      .update({
        claimed_by: claimedArray.join(','),
        claimed_at: new Date().toISOString()
      })
      .eq('offer_type', offerType);

    if (updateError) throw updateError;

    return { success: true, claimed: true };
  } catch (e) {
    console.error('Error claiming offer:', e);
    throw e;
  }
}

// ─── USER FUNCTIONS ───

// Get All Users (Admin)
async function getUsers() {
  if (!supabaseConnected || !supabaseClient) {
    return JSON.parse(localStorage.getItem('pixlnex_users') || '[]');
  }

  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching users:', e);
    return [];
  }
}

// ─── EXPOSE GLOBALLY ───
window.Pixlnex = {
  // Config
  initSupabase,
  supabaseClient,
  supabaseConnected,
  useFallback,
  
  // Helpers
  formatPKR,
  
  // Auth
  signUpUser,
  signInUser,
  signOutUser,
  getCurrentUser,
  
  // Products
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  
  // Orders
  getOrders,
  getUserOrders,
  createOrder,
  updateOrderStatus,
  
  // Offers
  getOfferStatus,
  claimOffer,
  
  // Users
  getUsers,
  
  // Constants
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET,
  FALLBACK_PRODUCTS
};

console.log('📦 Pixlnex supabase.js loaded successfully!');

// Auto-init when page loads
document.addEventListener('DOMContentLoaded', function() {
  initSupabase();
});

// Also init immediately if DOM already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initSupabase();
}