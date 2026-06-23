const DEMO_STORAGE_KEYS = {
  business: 'elsati_business_users',
  supplier: 'elsati_supplier_users',
  session: 'elsati_active_session'
};

function getSupabaseClient() {
  if (!window.supabase || !window.ELSATI_SUPABASE) {
    return null;
  }

  if (!window.__elsatiSupabaseClient) {
    window.__elsatiSupabaseClient = window.supabase.createClient(
      window.ELSATI_SUPABASE.url,
      window.ELSATI_SUPABASE.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  return window.__elsatiSupabaseClient;
}

function readDemoUsers(role) {
  return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEYS[role]) || '[]');
}

function saveDemoUsers(role, users) {
  localStorage.setItem(DEMO_STORAGE_KEYS[role], JSON.stringify(users));
}

function seedDemoUsers() {
  if (!readDemoUsers('business').length) {
    saveDemoUsers('business', [
      { name: 'Procurement Lead', company: 'Elsati Demo Buyer', email: 'buyer@elsati.demo', password: 'demo1234' }
    ]);
  }

  if (!readDemoUsers('supplier').length) {
    saveDemoUsers('supplier', [
      { name: 'Supplier Admin', company: 'Elsati Demo Supplier', email: 'supplier@elsati.demo', password: 'demo1234' }
    ]);
  }
}

function setFeedback(id, message, ok) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.className = ok ? 'form-feedback ok' : 'form-feedback error';
}

async function syncSessionToLocal() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    localStorage.removeItem(DEMO_STORAGE_KEYS.session);
    return null;
  }

  const sessionData = {
    role: user.user_metadata?.role,
    name: user.user_metadata?.name,
    company: user.user_metadata?.company,
    email: user.email,
    userId: user.id
  };

  localStorage.setItem(DEMO_STORAGE_KEYS.session, JSON.stringify(sessionData));
  return sessionData;
}

async function registerWithSupabase(role, formId, feedbackId, redirectTo) {
  const form = document.getElementById(formId);
  const supabase = getSupabaseClient();
  if (!form || !supabase) return false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const user = Object.fromEntries(formData.entries());

    const { data, error } = await supabase.auth.signUp({
      email: user.email,
      password: user.password,
      options: {
        data: {
          role,
          name: user.name,
          company: user.company
        }
      }
    });

    if (error) {
      setFeedback(feedbackId, error.message, false);
      return;
    }

    if (!data.session) {
      setFeedback(feedbackId, 'Registration created. Check your email to confirm the account before signing in.', true);
      return;
    }

    await syncSessionToLocal();
    setFeedback(feedbackId, 'Registration successful. Redirecting to your dashboard...', true);
    setTimeout(() => {
      window.location.href = redirectTo;
    }, 700);
  });

  return true;
}

function registerDemoUser(role, formId, feedbackId, redirectTo) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const user = Object.fromEntries(formData.entries());
    const users = readDemoUsers(role);
    const exists = users.some(entry => entry.email.toLowerCase() === String(user.email).toLowerCase());

    if (exists) {
      setFeedback(feedbackId, 'An account with that email already exists. Please sign in instead.', false);
      return;
    }

    users.push(user);
    saveDemoUsers(role, users);
    localStorage.setItem(DEMO_STORAGE_KEYS.session, JSON.stringify({ role, ...user }));
    setFeedback(feedbackId, 'Registration successful. Redirecting to your dashboard...', true);
    setTimeout(() => {
      window.location.href = redirectTo;
    }, 700);
  });
}

async function loginWithSupabase(role, formId, feedbackId, redirectTo) {
  const form = document.getElementById(formId);
  const supabase = getSupabaseClient();
  if (!form || !supabase) return false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').toLowerCase();
    const password = String(formData.get('password') || '');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFeedback(feedbackId, error.message, false);
      return;
    }

    const session = await syncSessionToLocal();
    if (session?.role !== role) {
      setFeedback(feedbackId, 'This account does not match the selected sign-in role.', false);
      await supabase.auth.signOut();
      return;
    }

    setFeedback(feedbackId, 'Sign in successful. Opening your dashboard...', true);
    setTimeout(() => {
      window.location.href = redirectTo;
    }, 500);
  });

  return true;
}

function loginDemoUser(role, formId, feedbackId, redirectTo) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').toLowerCase();
    const password = String(formData.get('password') || '');
    const user = readDemoUsers(role).find(entry => entry.email.toLowerCase() === email && entry.password === password);

    if (!user) {
      setFeedback(feedbackId, 'Sign in failed. Use a registered account or the demo credentials shown on the page.', false);
      return;
    }

    localStorage.setItem(DEMO_STORAGE_KEYS.session, JSON.stringify({ role, ...user }));
    setFeedback(feedbackId, 'Sign in successful. Opening your dashboard...', true);
    setTimeout(() => {
      window.location.href = redirectTo;
    }, 500);
  });
}

async function bindDashboard(role) {
  const logoutButton = document.getElementById('logout-button');
  const nameNode = document.getElementById('dashboard-user-name');
  const companyNode = document.getElementById('dashboard-company-name');
  if (!nameNode || !companyNode) return;

  let session = null;
  const supabase = getSupabaseClient();
  if (supabase) {
    session = await syncSessionToLocal();
  }
  if (!session) {
    session = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEYS.session) || 'null');
  }

  if (!session || session.role !== role) {
    window.location.href = role === 'business' ? 'customer-signin.html' : 'supplier-signin.html';
    return;
  }

  nameNode.textContent = session.name || session.company || 'User';
  companyNode.textContent = session.company || 'Company';

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      localStorage.removeItem(DEMO_STORAGE_KEYS.session);
      if (supabase) {
        await supabase.auth.signOut();
      }
      window.location.href = 'signin.html';
    });
  }
}

seedDemoUsers();
(async () => {
  const businessRegistered = await registerWithSupabase('business', 'business-register-form', 'business-register-feedback', 'onboarding-complete.html');
  if (!businessRegistered) registerDemoUser('business', 'business-register-form', 'business-register-feedback', 'onboarding-complete.html');

  const supplierRegistered = await registerWithSupabase('supplier', 'supplier-register-form', 'supplier-register-feedback', 'onboarding-complete.html');
  if (!supplierRegistered) registerDemoUser('supplier', 'supplier-register-form', 'supplier-register-feedback', 'onboarding-complete.html');

  const businessLogin = await loginWithSupabase('business', 'business-signin-form', 'business-signin-feedback', 'business-dashboard.html');
  if (!businessLogin) loginDemoUser('business', 'business-signin-form', 'business-signin-feedback', 'business-dashboard.html');

  const supplierLogin = await loginWithSupabase('supplier', 'supplier-signin-form', 'supplier-signin-feedback', 'supplier-dashboard.html');
  if (!supplierLogin) loginDemoUser('supplier', 'supplier-signin-form', 'supplier-signin-feedback', 'supplier-dashboard.html');

  await bindDashboard('business');
  await bindDashboard('supplier');
})();


function bindOnboardingPage() {
  const titleNode = document.getElementById('onboarding-title');
  const copyNode = document.getElementById('onboarding-copy');
  const buttonNode = document.getElementById('onboarding-continue');
  const statusNode = document.getElementById('onboarding-status');
  if (!titleNode || !copyNode || !buttonNode || !statusNode) return;

  const session = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEYS.session) || 'null');
  if (!session || !session.role) {
    buttonNode.href = 'signin.html';
    statusNode.textContent = 'No active onboarding session was found. Return to sign in.';
    return;
  }

  const isBusiness = session.role === 'business';
  const nextUrl = isBusiness ? 'business-dashboard.html' : 'supplier-dashboard.html';
  titleNode.textContent = isBusiness ? 'Your buyer portal is ready.' : 'Your supplier portal is ready.';
  copyNode.textContent = isBusiness
    ? 'Your business account has been created successfully. You can now create requests, compare quotations, and manage suppliers from your buyer portal.'
    : 'Your supplier account has been created successfully. You can now review RFQs, submit quotations, and track buyer decisions from your supplier portal.';
  buttonNode.href = nextUrl;
  statusNode.textContent = `Redirecting to the ${isBusiness ? 'buyer' : 'supplier'} portal shortly...`;

  setTimeout(() => {
    window.location.href = nextUrl;
  }, 1800);
}

bindOnboardingPage();
