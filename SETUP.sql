  -- ============================================================================
  -- COMPLETE SUPABASE SETUP - RUN ALL QUERIES IN ORDER
  -- ============================================================================
  -- THIS IS THE FIXED VERSION THAT SOLVES "USER NOT FOUND" ERROR
  -- ============================================================================

  -- Step 1: Create gym_users table (FIXED - No email unique constraint initially)
  DROP TABLE IF EXISTS gym_users CASCADE;

  CREATE TABLE gym_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    address TEXT,
    weight NUMERIC,
    height NUMERIC,
    blood_group TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Add unique constraint for email (after data exists)
  ALTER TABLE gym_users ADD CONSTRAINT gym_users_email_unique UNIQUE (email);

  -- Create indexes
  CREATE INDEX idx_gym_users_email ON gym_users(email);
  CREATE INDEX idx_gym_users_id ON gym_users(id);
  CREATE INDEX idx_gym_users_role ON gym_users(role);

  -- Enable RLS
  ALTER TABLE gym_users ENABLE ROW LEVEL SECURITY;

  -- Step 2: Create attendance table
  DROP TABLE IF EXISTS attendance CASCADE;

  CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES gym_users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    check_in TIME,
    check_out TIME,
    duration TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Add unique constraint
  ALTER TABLE attendance ADD CONSTRAINT attendance_unique UNIQUE(user_id, date);

  -- Create indexes
  CREATE INDEX idx_attendance_user_id ON attendance(user_id);
  CREATE INDEX idx_attendance_date ON attendance(date);

  -- Enable RLS
  ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

  -- Step 3: Drop existing functions and triggers
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
  DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

  -- Step 4: Create trigger function for auto-profile creation
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    full_name_val TEXT;
    phone_val TEXT;
  BEGIN
    -- Extract metadata safely
    full_name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    phone_val := COALESCE(NEW.raw_user_meta_data->>'phone', '');

    -- Insert into gym_users
    INSERT INTO gym_users (id, email, full_name, phone, role)
    VALUES (
      NEW.id,
      NEW.email,
      full_name_val,
      phone_val,
      'user'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;
  $$;

  -- Step 5: Create trigger
  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

  -- Step 6: Create is_admin helper function
  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM gym_users 
      WHERE id = auth.uid() AND role = 'admin'
    );
  END;
  $$;

  -- Step 7: Create RLS policies for gym_users table
  -- Drop all existing policies first
  DROP POLICY IF EXISTS "Users can view own profile" ON gym_users;
  DROP POLICY IF EXISTS "Users can update own profile" ON gym_users;
  DROP POLICY IF EXISTS "Allow profile creation" ON gym_users;
  DROP POLICY IF EXISTS "Admins can view all" ON gym_users;
  DROP POLICY IF EXISTS "Admins can update all" ON gym_users;
  DROP POLICY IF EXISTS "Admins can delete all" ON gym_users;

  -- Policy: Users can view own profile
  CREATE POLICY "Users can view own profile"
  ON gym_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

  -- Policy: Users can update own profile
  CREATE POLICY "Users can update own profile"
  ON gym_users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

  -- Policy: Allow profile creation during signup
  CREATE POLICY "Allow profile creation"
  ON gym_users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

  -- Policy: Admins can view all profiles
  CREATE POLICY "Admins can view all"
  ON gym_users
  FOR SELECT
  TO authenticated
  USING (is_admin());

  -- Policy: Admins can update all profiles
  CREATE POLICY "Admins can update all"
  ON gym_users
  FOR UPDATE
  TO authenticated
  USING (is_admin());

  -- Policy: Admins can delete all profiles
  CREATE POLICY "Admins can delete all"
  ON gym_users
  FOR DELETE
  TO authenticated
  USING (is_admin());

  -- Step 8: Create RLS policies for attendance table
  -- Drop existing policies
  DROP POLICY IF EXISTS "Users can view own attendance" ON attendance;
  DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance;
  DROP POLICY IF EXISTS "Admins can view all attendance" ON attendance;
  DROP POLICY IF EXISTS "Admins can manage all attendance" ON attendance;

  -- Policy: Users can view own attendance
  CREATE POLICY "Users can view own attendance"
  ON attendance
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

  -- Policy: Users can insert own attendance
  CREATE POLICY "Users can insert own attendance"
  ON attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

  -- Policy: Admins can view all attendance
  CREATE POLICY "Admins can view all attendance"
  ON attendance
  FOR SELECT
  TO authenticated
  USING (is_admin());

  -- Policy: Admins can manage all attendance
  CREATE POLICY "Admins can manage all attendance"
  ON attendance
  FOR ALL
  TO authenticated
  USING (is_admin());

  -- ============================================================================
  -- VERIFICATION QUERIES - Run these to verify setup
  -- ============================================================================

  -- Check tables exist
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name IN ('gym_users', 'attendance');

  -- Check RLS is enabled
  SELECT tablename, rowsecurity FROM pg_tables 
  WHERE tablename IN ('gym_users', 'attendance') AND schemaname = 'public';

  -- Check policies
  SELECT tablename, policyname FROM pg_policies 
  WHERE tablename IN ('gym_users', 'attendance') ORDER BY tablename;

  -- ============================================================================
  -- TO CREATE ADMIN USER (after registration)
  -- ============================================================================

  -- Run this after registering a user:
  -- UPDATE gym_users SET role = 'admin' WHERE email = 'admin@example.com';

  -- Then verify:
  -- SELECT email, role FROM gym_users WHERE email = 'admin@example.com';
CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  price text NOT NULL,
  features text[] NOT NULL,
  duration text NOT NULL, -- e.g. "1 Month", "6 Month"
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- PUBLIC CAN READ (NO LOGIN REQUIRED)
CREATE POLICY "Public read plans"
ON plans
FOR SELECT
TO public
USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admin manage plans"
ON plans
FOR ALL
TO authenticated
USING (is_admin());
INSERT INTO plans (title, price, duration, features) VALUES
('BASIC', '₹800', '1 Month', ARRAY['Smart Workout Plan','At Home Workout']),
('PRO', '₹1000', '1 Month', ARRAY['Pro GyMs','Smart Workout Plan','At Home Workout']),
('PREMIUM', '₹1500', '1 Month', ARRAY['Elite GyMs','Pro GyMs','Smart Workout Plan','At Home Workout','Personal Training','Diet Plan']),
('BASIC', '₹5000', '6 Month', ARRAY['Smart Workout Plan','At Home Workout']),
('PRO', '₹6500', '6 Month', ARRAY['Pro GyMs','Smart Workout Plan','At Home Workout']),
('PREMIUM', '₹8000', '6 Month', ARRAY['Elite GyMs','Pro GyMs','Smart Workout Plan','At Home Workout','Personal Training','Diet Plan']);
