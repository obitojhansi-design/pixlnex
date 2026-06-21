// ============================================
// PIXLNEX - CENTRAL SUPABASE CONFIGURATION
// ============================================

const SUPABASE_URL = 'https://mskhicltjsnjitwfswis.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5dgWT5HaVjV6PaEpOrhcWw_6DUUC4uY';

let supabaseClient = null;
let supabaseConnected = false;

console.log('🚀 Supabase JS loading...');

function initSupabase() {
  try {
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseConnected = true;
      console.log('✅ Supabase connected successfully');
      console.log('📍 URL:', SUPABASE_URL);
      return supabaseClient;
    } else {
      console.error('❌ Supabase SDK not loaded');
      supabaseConnected = false;
      return null;
    }
  } catch (e) {
    console.error('❌ Supabase connection error:', e);
    supabaseConnected = false;
    return null;
  }
}

function formatPKR(amount) {
  return '₨ ' + (amount || 0).toLocaleString('en-PK');
}

// ─── AUTH ───
async function getCurrentUser() {
  if (!supabaseConnected || !supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (e) {
    console.error('User error:', e);
    return null;
  }
}

async function signOutUser() {
  if (supabaseConnected && supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch (e) { console.error(e); }
  }
  localStorage.removeItem('pixlnex_user');
  window.location.href = 'index.html';
}

async function signUpUser(email, password, userData) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Signup error:', e);
    throw e;
  }
}

async function signInUser(email, password) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Login error:', e);
    throw e;
  }
}

// ─── PRODUCTS ───
async function getProducts() {
  if (!supabaseConnected || !supabaseClient) {
    console.warn('⚠️ Supabase not connected');
    return [];
  }
  try {
    console.log('🔍 Fetching products...');
    const { data, error } = await supabaseClient
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    console.log('✅ Products fetched:', data?.length || 0);
    return data || [];
  } catch (e) {
    console.error('Products error:', e);
    return [];
  }
}

// ─── OFFERS ───
async function getOfferStatus(offerType) {
  if (!supabaseConnected || !supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('offer_type', offerType)
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Offer error:', e);
    return null;
  }
}

async function claimOffer(offerType, email) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }
  try {
    const { data, error } = await supabaseClient
      .from('offers')
      .select('*')
      .eq('offer_type', offerType)
      .single();
    if (error) throw error;

    if (!data || data.is_active === false) {
      throw new Error('Offer not active');
    }

    const claimedArray = data.claimed_by ? data.claimed_by.split(',').filter(Boolean) : [];

    if (claimedArray.includes(email)) {
      throw new Error('Already claimed');
    }

    if (claimedArray.length >= data.total_limit) {
      throw new Error('Fully claimed');
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
    return { success: true };

  } catch (e) {
    console.error('Claim error:', e);
    throw e;
  }
}

// ─── ORDERS ───
async function createOrder(orderData) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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
        custom_details: orderData.custom_details || '',
        custom_type: orderData.custom_type || '',
        custom_budget: orderData.custom_budget || '',
        created_at: new Date().toISOString()
      }])
      .select();
    if (error) throw error;
    return data ? data[0] : null;
  } catch (e) {
    console.error('Order error:', e);
    throw e;
  }
}

// ─── USER FUNCTIONS ───
async function getUsers() {
  if (!supabaseConnected || !supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Users error:', e);
    return [];
  }
}

// ─── EXPOSE ───
window.Pixlnex = {
  initSupabase,
  supabaseClient,
  supabaseConnected,
  formatPKR,
  getCurrentUser,
  signOutUser,
  signUpUser,
  signInUser,
  getProducts,
  createOrder,
  getOfferStatus,
  claimOffer,
  getUsers,
  SUPABASE_URL,
  SUPABASE_ANON_KEY
};

console.log('📦 Pixlnex loaded!');

// Auto-init
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initSupabase();
} else {
  document.addEventListener('DOMContentLoaded', initSupabase);
}