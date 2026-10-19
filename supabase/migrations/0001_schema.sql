-- ============================================
-- WMS Migration 0001: Schema
-- Source: PRD v1.0 Section 4 (verbatim)
-- Run order: 1 of 3
-- ============================================

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'reception', 'technician')),
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER CHECK (year >= 1900 AND year <= EXTRACT(YEAR FROM NOW()) + 1),
  license_plate TEXT NOT NULL UNIQUE,
  vin TEXT,
  color TEXT,
  odometer INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX idx_vehicles_plate ON vehicles(license_plate);

-- ============================================
-- JOB ORDERS
-- ============================================
CREATE TABLE job_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE, -- e.g., JO-2026-0001
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  billing_type TEXT NOT NULL CHECK (billing_type IN ('cng_installment', 'post_service', 'upfront')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'waiting_parts', 'completed', 'paid', 'cancelled'
  )),
  complaint TEXT NOT NULL,
  estimated_amount DECIMAL(12,2),
  actual_amount DECIMAL(12,2),
  assigned_technician_id UUID REFERENCES profiles(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  date_in DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date_out DATE,
  actual_date_out DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_orders_customer ON job_orders(customer_id);
CREATE INDEX idx_job_orders_vehicle ON job_orders(vehicle_id);
CREATE INDEX idx_job_orders_technician ON job_orders(assigned_technician_id);
CREATE INDEX idx_job_orders_status ON job_orders(status);
CREATE INDEX idx_job_orders_date ON job_orders(date_in);

-- ============================================
-- JOB ORDER LINE ITEMS
-- ============================================
CREATE TABLE job_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('labor', 'part')),
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_items_job ON job_order_items(job_order_id);

-- ============================================
-- JOB LOGS (technician status updates)
-- ============================================
CREATE TABLE job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'waiting_parts', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job ON job_logs(job_order_id);

-- ============================================
-- SERVICE HISTORY (non-billable / minor complaints)
-- ============================================
CREATE TABLE service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES profiles(id),
  description TEXT NOT NULL,
  is_billable BOOLEAN DEFAULT FALSE,
  linked_job_order_id UUID REFERENCES job_orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_history_vehicle ON service_history(vehicle_id);

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES job_orders(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card', 'other')),
  reference_number TEXT,
  notes TEXT,
  received_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_job ON payments(job_order_id);
CREATE INDEX idx_payments_date ON payments(created_at);

-- ============================================
-- RECEIPTS (sequential numbering + audit)
-- ============================================
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE, -- e.g., RCP-2026-0001
  payment_id UUID NOT NULL REFERENCES payments(id),
  job_order_id UUID NOT NULL REFERENCES job_orders(id),
  amount DECIMAL(12,2) NOT NULL,
  is_duplicate BOOLEAN DEFAULT FALSE,
  original_receipt_id UUID REFERENCES receipts(id),
  printed_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_receipts_payment ON receipts(payment_id);
CREATE INDEX idx_receipts_job ON receipts(job_order_id);

-- ============================================
-- DOCUMENT SEQUENCES (atomic sequential numbering)
-- ============================================
CREATE TABLE document_sequences (
  document_type TEXT NOT NULL CHECK (document_type IN ('job_order', 'receipt')),
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (document_type, year)
);

-- Initialize sequences for current year
INSERT INTO document_sequences (document_type, year, last_number) VALUES
  ('job_order', 2026, 0),
  ('receipt', 2026, 0);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL, -- e.g., 'payment.created', 'receipt.reprinted', 'job.status_changed'
  entity_type TEXT NOT NULL, -- e.g., 'payment', 'receipt', 'job_order'
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at);
