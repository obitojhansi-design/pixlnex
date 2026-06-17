// supabase.js - Centralized Supabase Configuration
// ⚠️ REPLACE WITH YOUR ACTUAL CREDENTIALS

const SUPABASE_URL = 'https://mskhicltjsnjitwfswis.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5dgWT5HaVjV6PaEpOrhcWw_6DUUC4uY';
const SUPABASE_BUCKET = 'product-images';

let supabaseClient = null;
let supabaseConnected = false;

function initSupabase() {
  try {
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseConnected = true;
      console.log('✅ Supabase connected');
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

// ─── HELPER: Format PKR ───
function formatPKR(amount) {
  return '₨ ' + (amount || 0).toLocaleString('en-PK');
}

// ─── AUTH FUNCTIONS ───

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

async function signInUser(email, password) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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

async function signOutUser() {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }

  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.error('Logout error:', e);
    return { success: false, error: e.message };
  }
}

async function getCurrentUser() {
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

async function getProducts() {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }

  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching products:', e);
    throw e;
  }
}

async function addProduct(productData, imageFile) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }

  try {
    let imageUrl = '';
    let imagePath = '';

    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      imagePath = `products/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(SUPABASE_BUCKET)
        .upload(imagePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(imagePath);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabaseClient
      .from('products')
      .insert([{
        name: productData.name,
        description: productData.desc || productData.description,
        price: productData.price,
        icon: productData.icon || 'fa-cube',
        features: productData.features || [],
        image_url: imageUrl,
        image_path: imagePath,
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

async function updateProduct(productId, updates) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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

async function deleteProduct(productId, imagePath) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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

async function getOrders() {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
  }

  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error fetching orders:', e);
    throw e;
  }
}

async function getUserOrders(email) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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
    throw e;
  }
}

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
        status: 'processing',
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

async function updateOrderStatus(orderId, newStatus) {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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

// ─── USER FUNCTIONS ───

async function getUsers() {
  if (!supabaseConnected || !supabaseClient) {
    throw new Error('Supabase not connected');
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
    throw e;
  }
}

// ─── EXPOSE GLOBALLY ───
window.Pixlnex = {
  initSupabase,
  supabaseClient,
  supabaseConnected,
  formatPKR,
  signUpUser,
  signInUser,
  signOutUser,
  getCurrentUser,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  getUserOrders,
  createOrder,
  updateOrderStatus,
  getUsers,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET
};

document.addEventListener('DOMContentLoaded', function() {
  initSupabase();
});