import { supabase } from './supabaseClient.js';

/* =========================================================================
   START: Core Authentication Functions
   ========================================================================= */

export async function registerUser(email, password, fullName, phone) {
  try {
    console.log('📝 Registering user:', email);

    if (!email || !password || !fullName) {
      throw new Error('Email, password, and full name are required');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          phone: phone || ''
        }
      }
    });

    if (authError) {
      console.error('❌ Auth signup error:', authError);
      throw new Error('Registration failed: ' + authError.message);
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user returned');
    }

    console.log('✅ Auth user created:', authData.user.id);

    await new Promise(resolve => setTimeout(resolve, 500));

    const { data: profile } = await supabase
      .from('gym_users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profile) {
      console.log('✅ Profile created in gym_users:', profile.id);
    }

    return {
      success: true,
      user: authData.user,
      message: 'Registration successful! Check your email to verify your account.'
    };

  } catch (error) {
    console.error('❌ Registration error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function loginUser(email, password) {
  try {
    console.log('🔓 Logging in user:', email);

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('❌ Auth login error:', authError);
      throw new Error('Login failed: ' + authError.message);
    }

    if (!authData.session || !authData.user) {
      throw new Error('Login failed - no session created');
    }

    const { data: profile, error: profileError } = await supabase
      .from('gym_users')
      .select('id, email, full_name, role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ Profile fetch error:', profileError);
      throw new Error('User profile not found in database.');
    }

    console.log('✅ Profile loaded:', profile.id, profile.role);

    return {
      success: true,
      user: profile,
      role: profile.role,
      message: 'Login successful'
    };

  } catch (error) {
    console.error('❌ Login error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function logoutUser() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    console.log('✅ User logged out');
    return { success: true };

  } catch (error) {
    console.error('❌ Logout error:', error);
    return { success: false, error: error.message };
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('gym_users')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      authUser: user,
      profile: profile || null
    };

  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}
/* =========================================================================
   END: Core Authentication Functions
   ========================================================================= */