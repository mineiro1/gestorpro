-- Supabase Schema Migration from Firebase

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE
create table if not exists users (
  id uuid references auth.users not null primary key,
  role text not null check (role in ('admin', 'employee', 'manager', 'client')),
  name text,
  phone text,
  email text not null,
  password text,
  client_id uuid,
  admin_id uuid references users(id),
  custom_products jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  subscription_status text check (subscription_status in ('trial', 'active', 'expired')),
  subscription_expires_at timestamp with time zone,
  whatsapp_settings jsonb default '{}'::jsonb,
  active boolean default true,
  last_location jsonb,
  location_updated_at timestamp with time zone
);
alter table users enable row level security;

-- CLIENTS TABLE
create table if not exists clients (
  id uuid default uuid_generate_v4() primary key,
  admin_id uuid references users(id) not null,
  employee_id uuid references users(id),
  name text not null,
  cpf_cnpj text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  payment_day integer,
  monthly_fee numeric,
  monthly_price numeric,
  payment_status text default 'pendente',
  due_date text,
  base_due_day integer,
  visit_days jsonb,
  extra_visits jsonb,
  pool_count integer,
  extra_amount numeric,
  extra_reason text,
  active boolean default true,
  inactivated_at timestamp with time zone,
  last_visit_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table clients enable row level security;

-- VISITS TABLE
create table if not exists visits (
  id uuid default uuid_generate_v4() primary key,
  admin_id uuid references users(id) not null,
  client_id uuid references clients(id) not null,
  employee_id uuid references users(id) not null,
  date timestamp with time zone not null,
  time text,
  status text check (status in ('agendada', 'realizada', 'ausente', 'cancelada', 'iniciada', 'pausada', 'finalizada')),
  notes text,
  location text,
  photo_url text,
  photo_urls jsonb,
  equipment jsonb,
  supplies jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table visits enable row level security;

-- PAYMENTS TABLE
create table if not exists payments (
  id uuid default uuid_generate_v4() primary key,
  admin_id uuid references users(id) not null,
  client_id uuid references clients(id) not null,
  amount numeric not null,
  base_amount numeric,
  extra_amount numeric,
  extra_reason text,
  month integer,
  year integer,
  ref_month integer,
  ref_year integer,
  previous_due_date text,
  status text check (status in ('pendente', 'pago', 'atrasado')),
  due_date date,
  paid_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table payments enable row level security;

-- AGENDA_CONTACTS TABLE
create table if not exists agenda_contacts (
  id uuid default uuid_generate_v4() primary key,
  admin_id uuid references users(id) not null,
  name text not null,
  phone text not null,
  role text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table agenda_contacts enable row level security;

-- ONEOFFJOBS TABLE
create table if not exists oneoffjobs (
  id uuid default uuid_generate_v4() primary key,
  admin_id uuid references users(id) not null,
  employee_id uuid references users(id),
  client_id uuid references clients(id),
  client_name text,
  client_phone text,
  title text not null,
  description text,
  date text not null,
  return_date text,
  report text,
  price numeric not null,
  status text check (status in ('pendente', 'em_andamento', 'concluido', 'cancelado')),
  updated_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table oneoffjobs enable row level security;

-- SETTINGS TABLE
create table if not exists settings (
  id text primary key,
  monthlyPrice numeric,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
alter table settings enable row level security;

-- RLS POLICIES
-- Allow full access for authenticated users to avoid RLS block issues

create policy "Allow all operations for authenticated users on clients" on clients for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on users" on users for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on visits" on visits for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on payments" on payments for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on agenda_contacts" on agenda_contacts for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on oneoffjobs" on oneoffjobs for all to authenticated using (true) with check (true);
create policy "Allow all operations for authenticated users on settings" on settings for all to authenticated using (true) with check (true);

-- Trigger for new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'client'));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
