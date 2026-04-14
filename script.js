/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

/* App-level state */
const STORAGE_KEY = "lorealSelectedProductIds";
let allProducts = [];
let visibleProducts = [];
let selectedProductIds = new Set();
let expandedProductIds = new Set();
let conversationHistory = [];
let routineGenerated = false;

/* Show initial placeholders */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

chatWindow.innerHTML = `
  <p class="chat-empty-state">
    Select products and click Generate Routine to get personalized advice.
  </p>
`;

/* Load selected IDs from localStorage */
function loadSavedSelections() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return new Set();
  }

  const parsedIds = JSON.parse(saved);
  return new Set(parsedIds);
}

/* Save selected IDs to localStorage */
function saveSelections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedProductIds]));
}

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Return selected product objects from all products */
function getSelectedProducts() {
  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

/* Render chips in the "Selected Products" section */
function renderSelectedProductsList() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-empty-message">No products selected yet.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-chip">
        <div class="selected-chip-text">
          <strong dir="auto">${product.name}</strong>
          <span dir="auto">${product.brand}</span>
        </div>
        <button
          class="remove-selected-btn"
          type="button"
          data-remove-product-id="${product.id}"
          aria-label="Remove ${product.name}"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `,
    )
    .join("");
}

/* Render product cards in the grid */
function displayProducts(products) {
  visibleProducts = products;

  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found for this category.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      const isExpanded = expandedProductIds.has(product.id);

      return `
        <article
          class="product-card ${isSelected ? "selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
        >
          <img src="${product.image}" alt="${product.name}">

          <div class="product-info">
            <h3 dir="auto">${product.name}</h3>
            <p dir="auto">${product.brand}</p>

            <button
              type="button"
              class="description-toggle"
              data-description-toggle-id="${product.id}"
              aria-controls="description-${product.id}"
              aria-expanded="${isExpanded}"
            >
              ${isExpanded ? "Hide details" : "View details"}
            </button>

            <p id="description-${product.id}" dir="auto" class="product-description ${isExpanded ? "is-visible" : ""}">
              ${product.description}
            </p>
          </div>
        </article>
      `;
    })
    .join("");
}

/* Apply category + keyword filters together */
function applyProductFilters() {
  const selectedCategory = categoryFilter.value;
  const searchQuery = productSearch.value.trim().toLowerCase();

  const filteredProducts = allProducts.filter((product) => {
    const matchesCategory = selectedCategory
      ? product.category === selectedCategory
      : true;

    const searchableText =
      `${product.name} ${product.brand} ${product.description} ${product.category}`.toLowerCase();
    const matchesSearch = searchQuery
      ? searchableText.includes(searchQuery)
      : true;

    return matchesCategory && matchesSearch;
  });

  if (!selectedCategory && !searchQuery) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or search by keyword to view products.
      </div>
    `;
    visibleProducts = [];
    return;
  }

  displayProducts(filteredProducts);
}

/* Toggle one product in or out of selected state */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelections();
  renderSelectedProductsList();
  displayProducts(visibleProducts);
}

/* Expand/collapse the product description text */
function toggleProductDescription(productId) {
  if (expandedProductIds.has(productId)) {
    expandedProductIds.delete(productId);
  } else {
    expandedProductIds.add(productId);
  }

  displayProducts(visibleProducts);
}

/* Print one chat message in the chat window */
function addChatMessage(role, message) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;
  messageElement.setAttribute("dir", "auto");
  messageElement.textContent = message;

  /* Remove empty-state text once real messages begin */
  const emptyState = chatWindow.querySelector(".chat-empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return messageElement;
}

/* Call OpenAI with a messages array and return the assistant reply */
async function askOpenAI(messages) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response;

  try {
    response = await fetch(
      "https://loreal-chatbot-worker.folusomololuwa.workers.dev/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1",
          messages,
          temperature: 0.7,
        }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Worker error: ${errorText}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("Worker response format is invalid.");
  }

  return data.choices[0].message.content || "";
}

/* Build routine from selected products */
async function generateRoutine() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    addChatMessage(
      "assistant",
      "Please select at least one product before generating your routine.",
    );
    return;
  }

  const selectedProductPayload = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const systemMessage = {
    role: "system",
    content:
      "You are a helpful L'Oreal routine advisor. Use only the products selected by the user when building the routine. After the routine is generated, answer follow-up questions related to that routine or beauty topics like skincare, haircare, makeup, fragrance, suncare, and grooming. Use current web information when helpful, and include source links/citations you used. If a question is unrelated, politely redirect to routine or beauty topics.",
  };

  const routineRequestMessage = {
    role: "user",
    content: `Create a clear personalized routine using only these selected products. Include product order, morning/night tips, and a short safety reminder for sensitive skin:\n\n${JSON.stringify(
      selectedProductPayload,
      null,
      2,
    )}`,
  };

  const loadingMessage = addChatMessage(
    "assistant",
    "Generating your routine...",
  );

  try {
    const initialMessages = [systemMessage, routineRequestMessage];
    const assistantReply = await askOpenAI(initialMessages);
    const safeReply = assistantReply.trim();

    loadingMessage.remove();

    if (!safeReply) {
      addChatMessage(
        "assistant",
        "I could not generate a routine just now. Please try again in a moment.",
      );
      return;
    }

    conversationHistory = [
      ...initialMessages,
      {
        role: "assistant",
        content: safeReply,
      },
    ];

    routineGenerated = true;
    addChatMessage("assistant", safeReply);
  } catch (error) {
    loadingMessage.remove();
    addChatMessage(
      "assistant",
      error.name === "AbortError"
        ? "The request timed out. Please try again."
        : error.message,
    );
  }
}

/* Handle follow-up chat messages after routine generation */
async function submitFollowUpQuestion(questionText) {
  addChatMessage("user", questionText);

  conversationHistory.push({
    role: "user",
    content: questionText,
  });

  const thinkingMessage = addChatMessage("assistant", "Thinking...");

  try {
    const assistantReply = await askOpenAI(conversationHistory);
    const safeReply = assistantReply.trim();

    thinkingMessage.remove();

    if (!safeReply) {
      addChatMessage(
        "assistant",
        "I could not generate a reply just now. Please ask again.",
      );
      return;
    }

    conversationHistory.push({
      role: "assistant",
      content: safeReply,
    });

    addChatMessage("assistant", safeReply);
  } catch (error) {
    thinkingMessage.remove();
    addChatMessage(
      "assistant",
      error.name === "AbortError"
        ? "The request timed out. Please try again."
        : error.message,
    );
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", () => {
  applyProductFilters();
});

/* Filter and display products while user types in search */
productSearch.addEventListener("input", () => {
  applyProductFilters();
});

/* Product card click handling (select and details toggle) */
productsContainer.addEventListener("click", (event) => {
  const descriptionButton = event.target.closest(".description-toggle");
  if (descriptionButton) {
    const productId = Number(descriptionButton.dataset.descriptionToggleId);
    toggleProductDescription(productId);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

/* Keyboard support for selecting cards */
productsContainer.addEventListener("keydown", (event) => {
  if (event.target.closest(".description-toggle")) {
    return;
  }

  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const productId = Number(card.dataset.productId);
    toggleProductSelection(productId);
  }
});

/* Remove one selected product from the selected list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected-btn");
  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.removeProductId);
  selectedProductIds.delete(productId);
  saveSelections();
  renderSelectedProductsList();
  displayProducts(visibleProducts);
});

/* Clear all selected products */
clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds = new Set();
  saveSelections();
  renderSelectedProductsList();
  displayProducts(visibleProducts);
});

/* Generate routine button */
generateRoutineBtn.addEventListener("click", async () => {
  await generateRoutine();
});

/* Chat form submission handler */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const questionText = userInput.value.trim();
  if (!questionText) {
    return;
  }

  if (!routineGenerated) {
    addChatMessage(
      "assistant",
      "Generate a routine first, then I can answer follow-up questions about your routine and beauty topics.",
    );
    userInput.value = "";
    return;
  }

  userInput.value = "";
  await submitFollowUpQuestion(questionText);
});

/* Initial app setup */
async function initializeApp() {
  allProducts = await loadProducts();
  selectedProductIds = loadSavedSelections();
  renderSelectedProductsList();
  applyProductFilters();
}

initializeApp();
