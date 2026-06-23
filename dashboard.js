(function () {
  const supabaseClient = supabase.createClient(
    window.ELSATI_SUPABASE.url,
    window.ELSATI_SUPABASE.publishableKey
  );

  let selectedSupplierRfqId = null;
  let currentBusinessRfq = null;

  function formatCurrency(value) {
    return `K${Number(value || 0).toLocaleString()}`;
  }

  function shortRfqCode(rfq, index) {
    return rfq.code || `RFQ-${String(index + 1).padStart(3, "0")}`;
  }

  function safeText(value, fallback = "Not provided") {
    return value && String(value).trim() ? value : fallback;
  }

  function extractDeliveryDays(value) {
    if (!value) return 9999;

    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : 9999;
  }

  function getSmartQuoteRecommendation(quotes) {
    if (!quotes || quotes.length === 0) return null;

    const normalizedQuotes = quotes.map((quote) => ({
      ...quote,
      finalPrice: Number(quote.quoted_price || quote.price || 0),
      deliveryDays: extractDeliveryDays(quote.delivery_period || quote.delivery)
    }));

    const validPrices = normalizedQuotes.map((quote) => quote.finalPrice).filter(price => price > 0);

    if (validPrices.length === 0) return null;

    const lowestPrice = Math.min(...validPrices);
    const highestPrice = Math.max(...validPrices);
    const averagePrice = validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;

    const lowestQuote = normalizedQuotes.find((quote) => quote.finalPrice === lowestPrice);
    const fastestQuote = normalizedQuotes.reduce((best, quote) => {
      return quote.deliveryDays < best.deliveryDays ? quote : best;
    }, normalizedQuotes[0]);

    const recommendedQuote = lowestQuote || normalizedQuotes[0];

    const potentialSaving = highestPrice - lowestPrice;

    let reason = "This supplier currently has the most competitive submitted price.";

    if (
      fastestQuote &&
      fastestQuote.id === recommendedQuote.id &&
      normalizedQuotes.length > 1
    ) {
      reason = "This supplier currently has the lowest price and the fastest delivery period.";
    } else if (recommendedQuote.deliveryDays <= 3) {
      reason = "This supplier has the lowest price and a strong delivery timeline.";
    }

    return {
      recommendedQuote,
      lowestQuote,
      fastestQuote,
      lowestPrice,
      highestPrice,
      averagePrice,
      potentialSaving,
      reason
    };
  }

  async function getCurrentUserAndProfile() {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
      return { user: null, profile: null };
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return { user: userData.user, profile: null };
    }

    return { user: userData.user, profile };
  }

  async function saveProfileDetails(form, userId, feedbackNode) {
    const payload = {
      company_name: form.querySelector('[name="company_name"]')?.value || null,
      business_address: form.querySelector('[name="business_address"]')?.value || null,
      city: form.querySelector('[name="city"]')?.value || null,
      country: form.querySelector('[name="country"]')?.value || "Zambia",
      contact_person: form.querySelector('[name="contact_person"]')?.value || null,
      contact_phone: form.querySelector('[name="contact_phone"]')?.value || null,
      business_description: form.querySelector('[name="business_description"]')?.value || null,
      supplier_category: form.querySelector('[name="supplier_category"]')?.value || null,
      profile_completed: true
    };

    const { error } = await supabaseClient
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (error) {
      feedbackNode.textContent = error.message;
      feedbackNode.className = "form-feedback error";
      return false;
    }

    feedbackNode.textContent = "Profile updated successfully.";
    feedbackNode.className = "form-feedback ok";
    return true;
  }

  function fillProfileForm(form, profile) {
    if (!form || !profile) return;

    const fields = [
      "company_name",
      "business_address",
      "city",
      "country",
      "contact_person",
      "contact_phone",
      "business_description",
      "supplier_category"
    ];

    fields.forEach((field) => {
      const input = form.querySelector(`[name="${field}"]`);
      if (input) input.value = profile[field] || "";
    });
  }

  async function loadBusinessDashboard() {
    const listNode = document.getElementById("business-rfq-list");
    const form = document.getElementById("rfq-create-form");

    if (!listNode || !form) return;

    const feedback = document.getElementById("rfq-create-feedback");
    const comparisonTitle = document.getElementById("comparison-title");
    const comparisonTable = document.getElementById("business-comparison-table");
    const reportNode = document.getElementById("procurement-report");
    const activeCount = document.getElementById("active-rfq-count");
    const quoteCount = document.getElementById("quotes-received-count");
    const profileForm = document.getElementById("business-profile-form");
    const profileFeedback = document.getElementById("business-profile-feedback");
    const supplierDirectory = document.getElementById("business-supplier-directory");
    const activityList = document.getElementById("business-activity-list");

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile) {
      window.location.href = "customer-signin.html";
      return;
    }

    if (profile.role !== "business") {
      await supabaseClient.auth.signOut();
      window.location.href = "signin.html";
      return;
    }

    document.getElementById("dashboard-user-name").textContent =
      profile.company_name || profile.email || "Business user";

    document.getElementById("dashboard-company-name").textContent =
      profile.company_name || "Company";

    if (profileForm) {
      fillProfileForm(profileForm, profile);

      profileForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        await saveProfileDetails(profileForm, user.id, profileFeedback);
      });
    }

    async function awardQuote(quoteId, rfqId) {
      const confirmed = confirm("Are you sure you want to award this supplier?");
      if (!confirmed) return;

      const { error: resetError } = await supabaseClient
        .from("quotes")
        .update({
          awarded: false,
          status: "submitted",
          quote_status: "not_selected"
        })
        .eq("rfq_id", rfqId);

      if (resetError) {
        alert(resetError.message);
        return;
      }

      const { error: awardError } = await supabaseClient
        .from("quotes")
        .update({
          awarded: true,
          status: "awarded",
          quote_status: "awarded"
        })
        .eq("id", quoteId);

      if (awardError) {
        alert(awardError.message);
        return;
      }

      const { error: rfqError } = await supabaseClient
        .from("rfqs")
        .update({
          status: "awarded",
          awarded_quote_id: quoteId,
          awarded_at: new Date().toISOString()
        })
        .eq("id", rfqId);

      if (rfqError) {
        alert(rfqError.message);
        return;
      }

      alert("Supplier awarded successfully.");
      await loadBusinessRFQs();
    }

    async function updateQuoteStatus(quoteId, status) {
      const { error } = await supabaseClient
        .from("quotes")
        .update({
          quote_status: status,
          status
        })
        .eq("id", quoteId);

      if (error) {
        alert(error.message);
        return;
      }

      if (currentBusinessRfq) await loadQuotesForRfq(currentBusinessRfq);
    }

    async function loadQuotesForRfq(rfq) {
      currentBusinessRfq = rfq;

      const { data: quotes, error } = await supabaseClient
        .from("quotes")
        .select("*")
        .eq("rfq_id", rfq.id)
        .order("created_at", { ascending: false });

      if (error) {
        comparisonTable.innerHTML = `<p class="empty-state">${error.message}</p>`;
        return;
      }

      comparisonTitle.textContent = `${rfq.code || "RFQ"} · ${rfq.title}`;

      if (!quotes || quotes.length === 0) {
        comparisonTable.innerHTML = `
          <p class="empty-state">No quotes yet. Supplier quotations will appear here once submitted.</p>
        `;

        reportNode.innerHTML = `
          <div class="report-card">
            <strong>Waiting for supplier quotes</strong>
            <p>${rfq.title} is live. Verified suppliers can now view and respond to this RFQ.</p>
            <p>Category: ${safeText(rfq.category)}</p>
            <p>Delivery location: ${safeText(rfq.delivery_location)}</p>
          </div>
        `;

        return;
      }

      comparisonTable.innerHTML = `
        <div class="comparison-row comparison-head">
          <strong>Supplier</strong>
          <strong>Price</strong>
          <strong>Delivery</strong>
          <strong>Status</strong>
          <strong>Action</strong>
        </div>

        ${quotes
          .map((quote) => {
            const supplierName =
              quote.supplier_name || quote.supplier_company || "Supplier";

            const price = quote.quoted_price || quote.price || 0;
            const delivery = quote.delivery_period || quote.delivery || "-";
            const quoteStatus = quote.quote_status || quote.status || "submitted";
            const isAwarded = quote.awarded === true || quote.status === "awarded";

            return `
              <div class="comparison-row">
                <span>
                  <strong>${supplierName}</strong><br>
                  <small>${quote.notes || "No notes added"}</small>
                </span>

                <span>${formatCurrency(price)}</span>

                <span>${delivery}</span>

                <span>
                  <span class="quote-status ${isAwarded ? "awarded" : ""}">
                    ${isAwarded ? "Awarded" : quoteStatus}
                  </span>
                </span>

                <span>
                  ${
                    isAwarded
                      ? `<button class="award-btn awarded-btn" disabled>Supplier Awarded</button>`
                      : `
                        <button class="award-btn" data-award-quote-id="${quote.id}">Award Supplier</button>
                        <button class="table-action" data-shortlist-quote-id="${quote.id}" type="button">Shortlist</button>
                        <button class="table-action" data-reject-quote-id="${quote.id}" type="button">Reject</button>
                      `
                  }
                </span>
              </div>
            `;
          })
          .join("")}
      `;

      comparisonTable.querySelectorAll("[data-award-quote-id]").forEach((button) => {
        button.addEventListener("click", async function () {
          await awardQuote(button.dataset.awardQuoteId, rfq.id);
        });
      });

      comparisonTable.querySelectorAll("[data-shortlist-quote-id]").forEach((button) => {
        button.addEventListener("click", async function () {
          await updateQuoteStatus(button.dataset.shortlistQuoteId, "shortlisted");
        });
      });

      comparisonTable.querySelectorAll("[data-reject-quote-id]").forEach((button) => {
        button.addEventListener("click", async function () {
          await updateQuoteStatus(button.dataset.rejectQuoteId, "rejected");
        });
      });

      const insight = getSmartQuoteRecommendation(quotes);

      if (!insight) {
        reportNode.innerHTML = `
          <article class="report-card">
            <h3>RFQ Details</h3>
            <p>Category: ${safeText(rfq.category)}</p>
            <p>Delivery location: ${safeText(rfq.delivery_location)}</p>
            <p>Estimated budget: ${formatCurrency(rfq.estimated_budget)}</p>
            <p>Status: ${rfq.status || "open"}</p>
          </article>
        `;
        return;
      }

      const recommendedName =
        insight.recommendedQuote.supplier_name ||
        insight.recommendedQuote.supplier_company ||
        "Supplier";

      const fastestName =
        insight.fastestQuote?.supplier_name ||
        insight.fastestQuote?.supplier_company ||
        "Supplier";

      reportNode.innerHTML = `
        <article class="report-card">
          <h3>Smart Recommendation</h3>
          <p><strong>${recommendedName}</strong> is currently recommended.</p>
          <p>${insight.reason}</p>
          <p>Potential saving compared to highest quote: <strong>${formatCurrency(insight.potentialSaving)}</strong></p>
        </article>

        <article class="report-card">
          <h3>RFQ Details</h3>
          <p>Category: ${safeText(rfq.category)}</p>
          <p>Delivery location: ${safeText(rfq.delivery_location)}</p>
          <p>Estimated budget: ${formatCurrency(rfq.estimated_budget)}</p>
          <p>Status: ${rfq.status || "open"}</p>
        </article>

        <article class="report-card">
          <h3>Price Intelligence</h3>
          <p>Lowest quote: ${formatCurrency(insight.lowestPrice)}</p>
          <p>Highest quote: ${formatCurrency(insight.highestPrice)}</p>
          <p>Average quote: ${formatCurrency(insight.averagePrice.toFixed(2))}</p>
        </article>

        <article class="report-card">
          <h3>Delivery Intelligence</h3>
          <p>Fastest supplier: <strong>${fastestName}</strong></p>
          <p>Fastest delivery estimate: ${
            insight.fastestQuote?.delivery_period ||
            insight.fastestQuote?.delivery ||
            "Not provided"
          }</p>
        </article>
      `;
    }

    async function loadBusinessRFQs() {
      const { data: rfqs, error } = await supabaseClient
        .from("rfqs")
        .select("*")
        .eq("business_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        listNode.innerHTML = `<p class="empty-state">${error.message}</p>`;
        return;
      }

      if (activeCount) {
        activeCount.textContent = rfqs ? rfqs.filter((rfq) => rfq.status === "open").length : 0;
      }

      const { data: allQuotes } = await supabaseClient.from("quotes").select("*");
      if (quoteCount) quoteCount.textContent = allQuotes ? allQuotes.length : 0;

      if (!rfqs || rfqs.length === 0) {
        listNode.innerHTML = `
          <p class="empty-state">No RFQs created yet. Create your first procurement request.</p>
        `;

        comparisonTitle.textContent = "No RFQ selected";
        comparisonTable.innerHTML = `
          <p class="empty-state">Create an RFQ to begin collecting supplier quotations.</p>
        `;
        reportNode.innerHTML = `
          <p class="empty-state">Procurement reports will appear once supplier quotes have been received.</p>
        `;
        return;
      }

      listNode.innerHTML = rfqs
        .map(
          (rfq, index) => `
            <button class="request-card" data-rfq-id="${rfq.id}" type="button">
              <strong>${shortRfqCode(rfq, index)}</strong>
              <span>${rfq.title}</span>
              <small>${rfq.category || "Uncategorized"} · ${rfq.quantity || 0} units</small>
              <small>${rfq.delivery_location || "No location"} · ${rfq.deadline || "No deadline"}</small>
              <small>Status: ${rfq.status || "open"}</small>
            </button>
          `
        )
        .join("");

      listNode.querySelectorAll("[data-rfq-id]").forEach((button) => {
        button.addEventListener("click", function () {
          const selected = rfqs.find((rfq) => rfq.id === button.dataset.rfqId);

          if (selected) {
            loadQuotesForRfq(selected);
          }
        });
      });

      await loadQuotesForRfq(rfqs[0]);
    }

    async function loadVerifiedSuppliers() {
      if (!supplierDirectory) return;

      const { data: suppliers, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("role", "supplier")
        .eq("verified", true)
        .order("company_name", { ascending: true });

      if (error) {
        supplierDirectory.innerHTML = `<p class="empty-state">${error.message}</p>`;
        return;
      }

      if (!suppliers || suppliers.length === 0) {
        supplierDirectory.innerHTML = `<p class="empty-state">No verified suppliers available yet.</p>`;
        return;
      }

      supplierDirectory.innerHTML = suppliers.map((supplier) => `
        <article class="request-card">
          <strong>${supplier.company_name || "Supplier"}</strong>
          <span>${supplier.supplier_category || "General supplier"}</span>
          <small>Contact: ${safeText(supplier.contact_person)} · ${safeText(supplier.contact_phone || supplier.phone)}</small>
          <small>${safeText(supplier.city)} / ${safeText(supplier.country, "Zambia")}</small>
          <span class="supplier-status-badge">Verified</span>
        </article>
      `).join("");
    }

    function renderBusinessActivity(rfqs, quotes) {
      if (!activityList) return;

      const items = [];

      (rfqs || []).slice(0, 3).forEach((rfq) => {
        items.push(`RFQ created: ${rfq.title} (${rfq.status || "open"})`);
      });

      (quotes || []).slice(0, 3).forEach((quote) => {
        items.push(`Quote submitted by ${quote.supplier_name || "Supplier"} for ${formatCurrency(quote.price || quote.quoted_price)}`);
      });

      activityList.innerHTML = items.length
        ? items.map(item => `<div class="activity-item"><strong>Update</strong> ${item}</div>`).join("")
        : `<div class="activity-item"><strong>System</strong> ready for live RFQ creation.</div>`;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const title = form.querySelector('input[name="title"]').value;
      const quantity = form.querySelector('input[name="quantity"]').value;
      const deadline = form.querySelector('input[name="deadline"]').value;
      const notes = form.querySelector('textarea[name="notes"]').value;
      const category = form.querySelector('[name="category"]')?.value || null;
      const deliveryLocation = form.querySelector('[name="delivery_location"]')?.value || null;
      const estimatedBudget = form.querySelector('[name="estimated_budget"]')?.value || null;

      feedback.textContent = "Creating RFQ...";
      feedback.className = "form-feedback";

      const { error } = await supabaseClient.from("rfqs").insert({
        code: "RFQ-" + Date.now(),
        business_id: user.id,
        business_name: profile.company_name || profile.email,
        created_by: user.id,
        created_by_company: profile.company_name || profile.email,
        title,
        quantity: Number(quantity),
        deadline,
        notes,
        category,
        delivery_location: deliveryLocation,
        estimated_budget: estimatedBudget ? Number(estimatedBudget) : null,
        status: "open"
      });

      if (error) {
        feedback.textContent = error.message;
        feedback.className = "form-feedback error";
        return;
      }

      feedback.textContent = "RFQ created successfully. Suppliers can now view it.";
      feedback.className = "form-feedback ok";

      form.reset();
      await loadBusinessRFQs();
    });

    const logoutButton = document.getElementById("logout-button");

    if (logoutButton) {
      logoutButton.addEventListener("click", async function () {
        await supabaseClient.auth.signOut();
        window.location.href = "customer-signin.html";
      });
    }

    await loadBusinessRFQs();
    await loadVerifiedSuppliers();

    const { data: rfqActivity } = await supabaseClient
      .from("rfqs")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: quoteActivity } = await supabaseClient
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });

    renderBusinessActivity(rfqActivity, quoteActivity);
  }

  async function loadSupplierRFQsOnly() {
    const listNode = document.getElementById("supplier-rfq-list");
    const form = document.getElementById("supplier-quote-form");
    const selectedField = document.getElementById("supplier-selected-rfq");
    const feedback = document.getElementById("supplier-quote-feedback");
    const quoteList = document.getElementById("supplier-quote-list");
    const openCount = document.getElementById("supplier-open-rfq-count");
    const profileForm = document.getElementById("supplier-profile-form");
    const profileFeedback = document.getElementById("supplier-profile-feedback");

    if (!listNode || !form) return;

    const { user, profile } = await getCurrentUserAndProfile();

    if (!user || !profile || profile.role !== "supplier") return;

    if (profileForm) {
      fillProfileForm(profileForm, profile);

      profileForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        await saveProfileDetails(profileForm, user.id, profileFeedback);
      });
    }

    const { data: rfqs, error } = await supabaseClient
      .from("rfqs")
      .select("*")
      .in("status", ["open", "awarded", "closed"])
      .order("created_at", { ascending: false });

    if (error) {
      listNode.innerHTML = `<p class="empty-state">${error.message}</p>`;
      return;
    }

    const openRfqs = rfqs ? rfqs.filter((rfq) => rfq.status === "open") : [];
    const closedRfqs = rfqs ? rfqs.filter((rfq) => rfq.status !== "open") : [];

    if (openCount) openCount.textContent = openRfqs.length;

    if (!rfqs || rfqs.length === 0) {
      listNode.innerHTML = `<p class="empty-state">No RFQs available yet.</p>`;
      return;
    }

    listNode.innerHTML = `
      <div class="rfq-section-block">
        <h3>Open Opportunities</h3>
        ${
          openRfqs.length
            ? openRfqs
                .map(
                  (rfq, index) => `
                    <article class="request-card" data-rfq-id="${rfq.id}" data-rfq-status="open">
                      <strong>${shortRfqCode(rfq, index)}</strong>
                      <p>${rfq.title}</p>
                      <small>${rfq.category || "Uncategorized"} · ${rfq.quantity || 0} units</small><br>
                      <small>${rfq.delivery_location || "No location"} · ${rfq.deadline || "No deadline"}</small><br>
                      <span class="supplier-status-badge">OPEN</span>
                    </article>
                  `
                )
                .join("")
            : `<p class="empty-state">No open RFQs available right now.</p>`
        }
      </div>

      <div class="rfq-section-block">
        <h3>Closed Opportunities</h3>
        ${
          closedRfqs.length
            ? closedRfqs
                .map(
                  (rfq, index) => `
                    <article class="request-card closed-rfq-card" data-rfq-id="${rfq.id}" data-rfq-status="${rfq.status}">
                      <strong>${shortRfqCode(rfq, index)}</strong>
                      <p>${rfq.title}</p>
                      <small>${rfq.category || "Uncategorized"} · ${rfq.quantity || 0} units</small><br>
                      <span class="supplier-status-badge closed-badge">${rfq.status || "closed"}</span>
                    </article>
                  `
                )
                .join("")
            : `<p class="empty-state">No closed RFQs yet.</p>`
        }
      </div>
    `;

    document.querySelectorAll("#supplier-rfq-list .request-card").forEach((card) => {
      card.addEventListener("click", function () {
        document.querySelectorAll("#supplier-rfq-list .request-card").forEach((item) => {
          item.classList.remove("active");
        });

        card.classList.add("active");

        const status = card.dataset.rfqStatus;
        const rfqNumber = card.querySelector("strong").textContent;
        const rfqTitle = card.querySelector("p").textContent;

        if (status !== "open") {
          selectedSupplierRfqId = null;

          if (selectedField) {
            selectedField.value = `${rfqNumber} - ${rfqTitle} is closed`;
          }

          feedback.textContent = "This RFQ is closed and no longer accepts quotations.";
          feedback.className = "form-feedback error";
          return;
        }

        selectedSupplierRfqId = card.dataset.rfqId;

        if (selectedField) {
          selectedField.value = rfqNumber + " - " + rfqTitle;
        }

        feedback.textContent = "";
        feedback.className = "form-feedback";
      });
    });

    async function loadMyQuotes() {
      const { data: myQuotes, error: quotesError } = await supabaseClient
        .from("quotes")
        .select("*")
        .eq("supplier_user_id", user.id)
        .order("created_at", { ascending: false });

      if (!quoteList) return;

      if (quotesError) {
        quoteList.innerHTML = `<p class="empty-state">${quotesError.message}</p>`;
        return;
      }

      if (!myQuotes || myQuotes.length === 0) {
        quoteList.innerHTML = `<p class="empty-state">Submitted quotations will appear here.</p>`;
        return;
      }

      quoteList.innerHTML = `
        <div class="comparison-row comparison-head">
          <strong>RFQ</strong>
          <strong>Price</strong>
          <strong>Delivery</strong>
          <strong>Status</strong>
        </div>

        ${myQuotes
          .map(
            (quote) => `
              <div class="comparison-row">
                <span>${quote.rfq_id}</span>
                <span>${formatCurrency(quote.quoted_price || quote.price)}</span>
                <span>${quote.delivery_period || quote.delivery}</span>
                <span>
                  <span class="quote-status ${
                    quote.awarded === true || quote.status === "awarded" ? "awarded" : ""
                  }">
                    ${
                      quote.awarded === true || quote.status === "awarded"
                        ? "Awarded"
                        : quote.quote_status || quote.status || "submitted"
                    }
                  </span>
                </span>
              </div>
            `
          )
          .join("")}
      `;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!profile.verified || profile.verification_status !== "approved") {
        feedback.textContent = "Your supplier account must be verified before submitting quotations.";
        feedback.className = "form-feedback error";
        return;
      }

      if (!selectedSupplierRfqId) {
        feedback.textContent = "Please select an open RFQ first.";
        feedback.className = "form-feedback error";
        return;
      }

      const { data: selectedRfq, error: selectedRfqError } = await supabaseClient
        .from("rfqs")
        .select("*")
        .eq("id", selectedSupplierRfqId)
        .maybeSingle();

      if (selectedRfqError || !selectedRfq || selectedRfq.status !== "open") {
        feedback.textContent = "This RFQ is closed and no longer accepts quotations.";
        feedback.className = "form-feedback error";
        selectedSupplierRfqId = null;
        return;
      }

      const price = form.querySelector('input[name="price"]').value;
      const delivery = form.querySelector('input[name="delivery"]').value;
      const notes = form.querySelector('textarea[name="notes"]').value;

      const supplierDisplayName = profile.company_name || profile.email || "Supplier";

      const { error: quoteError } = await supabaseClient.from("quotes").insert({
        rfq_id: selectedSupplierRfqId,
        supplier_id: user.id,
        supplier_user_id: user.id,
        supplier_name: supplierDisplayName,
        supplier_company: supplierDisplayName,
        quoted_price: Number(price),
        price: Number(price),
        delivery_period: delivery,
        delivery,
        notes,
        status: "submitted",
        quote_status: "submitted",
        awarded: false
      });

      if (quoteError) {
        feedback.textContent = quoteError.message;
        feedback.className = "form-feedback error";
        return;
      }

      feedback.textContent = "Quotation submitted successfully. The business can now compare your offer.";
      feedback.className = "form-feedback ok";

      form.reset();

      if (selectedField) selectedField.value = "";

      selectedSupplierRfqId = null;

      await loadMyQuotes();
    });

    await loadMyQuotes();
  }

  async function renderMonitor() {
    const rfqCount = document.getElementById("monitor-rfq-count");
    const rfqList = document.getElementById("monitor-rfq-list");

    if (!rfqCount || !rfqList) return;

    const { data: rfqs, error } = await supabaseClient
      .from("rfqs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      rfqList.innerHTML = `<p class="empty-state">${error.message}</p>`;
      return;
    }

    rfqCount.textContent = rfqs ? rfqs.length : 0;

    rfqList.innerHTML =
      rfqs && rfqs.length
        ? rfqs
            .map(
              (rfq, index) => `
                <div class="monitor-row">
                  <strong>${shortRfqCode(rfq, index)} · ${rfq.title}</strong>
                  <span>${rfq.category || "Uncategorized"} · ${rfq.quantity || 0} units · ${rfq.deadline || "No deadline"} · ${rfq.status || "open"}</span>
                </div>
              `
            )
            .join("")
        : `<p class="empty-state">No buyer RFQs are active yet.</p>`;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await loadBusinessDashboard();
    await loadSupplierRFQsOnly();
    await renderMonitor();
  });
})();
