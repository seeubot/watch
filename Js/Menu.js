document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const shopNameTitle = document.getElementById('shopNameTitle');
    const shopNameHeader = document.getElementById('shopNameHeader');
    const menuContainer = document.getElementById('menuContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const viewCartBtn = document.getElementById('viewCartBtn');
    const cartModal = document.getElementById('cartModal');
    const closeCartModal = document.getElementById('closeCartModal');
    const cartItemCount = document.getElementById('cartItemCount');
    const cartTotalPrice = document.getElementById('cartTotalPrice');
    const cartItemsList = document.getElementById('cartItemsList');
    const emptyCartMessage = document.getElementById('emptyCartMessage');
    const cartSubtotalSpan = document.getElementById('cartSubtotal');
    const cartTransportTaxSpan = document.getElementById('cartTransportTax');
    const cartDiscountSpan = document.getElementById('cartDiscount');
    const cartTotalSpan = document.getElementById('cartTotal');
    const checkoutForm = document.getElementById('checkoutForm');
    const customerNameInput = document.getElementById('customerName');
    const customerPhoneInput = document.getElementById('customerPhone');
    const deliveryAddressInput = document.getElementById('deliveryAddress');
    const deliveryLatInput = document.getElementById('deliveryLat');
    const deliveryLonInput = document.getElementById('deliveryLon');
    const messageDisplay = document.getElementById('messageDisplay');
    const messageText = document.getElementById('messageText');
    const closeMessageBtn = document.getElementById('closeMessage');
    const orderTrackingSection = document.getElementById('orderTrackingSection');
    const orderTrackingDetails = document.getElementById('orderTrackingDetails');
    const closeOrderTrackingBtn = document.getElementById('closeOrderTracking');
    const openMapBtn = document.getElementById('openMapBtn');
    const mapDiv = document.getElementById('map');

    // --- Global Variables ---
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    let allMenuItems = [];
    let publicSettings = {};
    let map = null; // Leaflet map instance
    let marker = null; // Leaflet marker instance
    let selectedLocation = null; // { latitude, longitude, address }

    // --- Constants ---
    const API_BASE_URL = window.location.origin; // Assumes frontend is served from the same domain as backend
    const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}';

    // --- Utility Functions ---

    /**
     * Displays a message to the user.
     * @param {string} msg - The message to display.
     * @param {string} type - 'success', 'error', 'info'.
     */
    function showMessage(msg, type = 'info') {
        messageText.innerHTML = msg; // Use innerHTML for potential bold tags
        messageDisplay.classList.remove('hidden', 'bg-blue-100', 'bg-green-100', 'bg-red-100', 'border-blue-500', 'border-green-500', 'border-red-500', 'text-blue-700', 'text-green-700', 'text-red-700');
        messageDisplay.classList.add('flex'); // Ensure it's flex for alignment

        switch (type) {
            case 'success':
                messageDisplay.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
                break;
            case 'error':
                messageDisplay.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
                break;
            case 'info':
            default:
                messageDisplay.classList.add('bg-blue-100', 'border-blue-500', 'text-blue-700');
                break;
        }
        messageDisplay.classList.remove('hidden');
        // Automatically hide after 5 seconds for success/info, keep error for user to dismiss
        if (type !== 'error') {
            setTimeout(() => {
                messageDisplay.classList.add('hidden');
            }, 5000);
        }
    }

    /**
     * Hides the message display.
     */
    function hideMessage() {
        messageDisplay.classList.add('hidden');
    }

    /**
     * Toggles the visibility of the loading spinner.
     * @param {boolean} show - True to show, false to hide.
     */
    function toggleLoading(show) {
        if (show) {
            loadingSpinner.classList.remove('hidden');
            menuContainer.classList.add('hidden');
        } else {
            loadingSpinner.classList.add('hidden');
            menuContainer.classList.remove('hidden');
        }
    }

    /**
     * Formats a number to Indian Rupee currency.
     * @param {number} amount - The amount to format.
     * @returns {string} Formatted currency string.
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }

    // --- Cart Functions ---

    /**
     * Saves the current cart to local storage.
     */
    function saveCart() {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    /**
     * Adds an item to the cart or increments its quantity.
     * @param {object} item - The item object to add.
     */
    function addToCart(item) {
        const existingItem = cart.find(cartItem => cartItem.itemId === item._id);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({
                itemId: item._id,
                name: item.name,
                price: item.price,
                quantity: 1,
                imageUrl: item.imageUrl // Keep image for cart display if needed
            });
        }
        saveCart();
        updateCartDisplay();
        showMessage(`${item.name} added to cart!`, 'success');
    }

    /**
     * Updates the quantity of an item in the cart.
     * @param {string} itemId - The ID of the item.
     * @param {number} newQuantity - The new quantity.
     */
    function updateCartQuantity(itemId, newQuantity) {
        const itemIndex = cart.findIndex(cartItem => cartItem.itemId === itemId);
        if (itemIndex > -1) {
            if (newQuantity <= 0) {
                cart.splice(itemIndex, 1); // Remove if quantity is 0 or less
            } else {
                cart[itemIndex].quantity = newQuantity;
            }
            saveCart();
            updateCartDisplay();
        }
    }

    /**
     * Calculates the subtotal, transport tax, discount, and total for the cart.
     * @returns {object} An object containing subtotal, transportTax, discountAmount, and totalAmount.
     */
    function calculateCartTotals() {
        let subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        let transportTax = 0;
        let discountAmount = 0;

        // Calculate transport tax based on settings
        if (publicSettings.deliveryRates && publicSettings.deliveryRates.length > 0) {
            transportTax = publicSettings.deliveryRates[0].amount; // Use the first rate's amount
        } else {
            transportTax = 30; // Default transport tax if no rates are defined
        }

        // Apply discount if conditions met
        if (publicSettings.minSubtotalForDiscount && publicSettings.discountPercentage && subtotal >= publicSettings.minSubtotalForDiscount) {
            discountAmount = subtotal * publicSettings.discountPercentage;
        }

        let totalAmount = subtotal + transportTax - discountAmount;
        if (totalAmount < 0) totalAmount = 0; // Ensure total doesn't go negative

        return { subtotal, transportTax, discountAmount, totalAmount };
    }

    /**
     * Updates the cart summary display and the cart modal content.
     */
    function updateCartDisplay() {
        const { subtotal, transportTax, discountAmount, totalAmount } = calculateCartTotals();

        cartItemCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartTotalPrice.textContent = formatCurrency(totalAmount);

        cartSubtotalSpan.textContent = formatCurrency(subtotal);
        cartTransportTaxSpan.textContent = formatCurrency(transportTax);
        cartDiscountSpan.textContent = formatCurrency(discountAmount);
        cartTotalSpan.textContent = formatCurrency(totalAmount);

        cartItemsList.innerHTML = ''; // Clear existing items
        if (cart.length === 0) {
            emptyCartMessage.classList.remove('hidden');
        } else {
            emptyCartMessage.classList.add('hidden');
            cart.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg shadow-sm';
                itemDiv.innerHTML = `
                    <div class="flex items-center">
                        <img src="${item.imageUrl || 'https://placehold.co/50x50/cccccc/ffffff?text=No+Image'}" alt="${item.name}" class="w-12 h-12 rounded-md object-cover mr-4">
                        <div>
                            <h4 class="font-semibold text-gray-800">${item.name}</h4>
                            <p class="text-sm text-gray-600">${formatCurrency(item.price)} each</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button data-id="${item.itemId}" data-action="decrease" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300">-</button>
                        <span class="font-medium text-gray-800">${item.quantity}</span>
                        <button data-id="${item.itemId}" data-action="increase" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-300">+</button>
                        <button data-id="${item.itemId}" data-action="remove" class="text-red-500 hover:text-red-700 ml-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </div>
                `;
                cartItemsList.appendChild(itemDiv);
            });
        }
    }

    // --- Map Functions ---

    /**
     * Initializes the Leaflet map.
     */
    function initMap() {
        if (map) {
            map.remove(); // Remove existing map if any
        }
        mapDiv.classList.remove('hidden');
        // Set default view to shop location or a general Indian city if not available
        const defaultLat = publicSettings.shopLocation?.latitude || 17.4399;
        const defaultLon = publicSettings.shopLocation?.longitude || 78.4983;

        map = L.map('map').setView([defaultLat, defaultLon], 13); // Zoom level 13

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Try to get user's current location
        map.locate({ setView: true, maxZoom: 16 });

        map.on('locationfound', function(e) {
            console.log('User location found:', e.latlng);
            addOrMoveMarker(e.latlng);
            reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        map.on('locationerror', function(e) {
            console.warn('Location access denied or error:', e.message);
            showMessage('Could not get your current location. Please manually select on map or enter address.', 'info');
            // If location fails, still add a marker at the default shop location
            addOrMoveMarker([defaultLat, defaultLon]);
            reverseGeocode(defaultLat, defaultLon);
        });

        // Add a draggable marker
        marker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(map);
        marker.on('dragend', function(e) {
            const latLng = marker.getLatLng();
            reverseGeocode(latLng.lat, latLng.lng);
        });

        // Add click listener to map to move marker
        map.on('click', function(e) {
            addOrMoveMarker(e.latlng);
            reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        // If a location was previously selected, set the marker to it
        if (selectedLocation && selectedLocation.latitude && selectedLocation.longitude) {
            addOrMoveMarker([selectedLocation.latitude, selectedLocation.longitude]);
            map.setView([selectedLocation.latitude, selectedLocation.longitude], 16);
        } else {
             // If no previous location, try to set marker to customer's last known address from local storage
            const storedLat = localStorage.getItem('deliveryLat');
            const storedLon = localStorage.getItem('deliveryLon');
            if (storedLat && storedLon) {
                const latLng = [parseFloat(storedLat), parseFloat(storedLon)];
                addOrMoveMarker(latLng);
                map.setView(latLng, 16);
                reverseGeocode(latLng[0], latLng[1]); // Reverse geocode to update address field
            }
        }
    }

    /**
     * Adds or moves the marker on the map.
     * @param {L.LatLng} latLng - The latitude and longitude.
     */
    function addOrMoveMarker(latLng) {
        if (marker) {
            marker.setLatLng(latLng);
        } else {
            marker = L.marker(latLng, { draggable: true }).addTo(map);
            marker.on('dragend', function(e) {
                const newLatLng = marker.getLatLng();
                reverseGeocode(newLatLng.lat, newLatLng.lng);
            });
        }
        selectedLocation = {
            latitude: latLng.lat,
            longitude: latLng.lng,
            address: 'Fetching address...' // Placeholder
        };
        deliveryLatInput.value = latLng.lat;
        deliveryLonInput.value = latLng.lng;
        // Disable manual address input when map is used
        deliveryAddressInput.readOnly = true;
        deliveryAddressInput.classList.add('bg-gray-100');
    }

    /**
     * Performs reverse geocoding to get address from coordinates.
     * @param {number} lat - Latitude.
     * @param {number} lon - Longitude.
     */
    async function reverseGeocode(lat, lon) {
        const url = NOMINATIM_API_URL.replace('{lat}', lat).replace('{lon}', lon);
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.display_name) {
                const address = data.display_name;
                deliveryAddressInput.value = address;
                selectedLocation.address = address;
            } else {
                deliveryAddressInput.value = `Address not found for ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                selectedLocation.address = deliveryAddressInput.value;
            }
        } catch (error) {
            console.error('Error during reverse geocoding:', error);
            deliveryAddressInput.value = 'Failed to fetch address. Please enter manually.';
            selectedLocation.address = deliveryAddressInput.value;
        }
    }

    // --- API Calls ---

    /**
     * Fetches public settings from the backend.
     */
    async function fetchPublicSettings() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/public/settings`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            publicSettings = await response.json();
            console.log('Public settings fetched:', publicSettings);
            shopNameTitle.textContent = `${publicSettings.shopName} - Menu`;
            shopNameHeader.textContent = publicSettings.shopName;
        } catch (error) {
            console.error('Error fetching public settings:', error);
            showMessage('Failed to load shop settings. Some features might not work correctly.', 'error');
            // Provide default settings if fetch fails
            publicSettings = {
                shopName: 'Delicious Bites',
                shopLocation: { latitude: 17.4399, longitude: 78.4983 },
                deliveryRates: [{ kms: 0, amount: 30 }], // Default delivery rate
                minSubtotalForDiscount: 200,
                discountPercentage: 0.20
            };
        }
    }

    /**
     * Fetches menu items from the backend.
     */
    async function fetchMenuItems() {
        toggleLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allMenuItems = await response.json();
            renderMenuItems(allMenuItems);
        } catch (error) {
            console.error('Error fetching menu items:', error);
            showMessage('Failed to load menu items. Please try again later.', 'error');
        } finally {
            toggleLoading(false);
        }
    }

    /**
     * Places an order with the backend.
     * @param {object} orderData - The order details.
     */
    async function placeOrder(orderData) {
        showMessage('Placing your order...', 'info');
        try {
            const response = await fetch(`${API_BASE_URL}/api/order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to place order.');
            }

            showMessage(`Order placed successfully! Your Order ID is *${result.orderId}* and PIN is *${result.pinId}*. You can track it using the PIN.`, 'success');
            cart = []; // Clear cart on successful order
            saveCart();
            updateCartDisplay();
            cartModal.classList.add('hidden'); // Close modal
            // Clear form fields
            checkoutForm.reset();
            // Store customer info for next time
            localStorage.setItem('customerName', orderData.customerName);
            localStorage.setItem('customerPhone', orderData.customerPhone);
            localStorage.setItem('deliveryAddress', orderData.deliveryAddress);
            localStorage.setItem('deliveryLat', orderData.customerLocation.latitude);
            localStorage.setItem('deliveryLon', orderData.customerLocation.longitude);

            // Reset map related fields
            selectedLocation = null;
            deliveryAddressInput.readOnly = false;
            deliveryAddressInput.classList.remove('bg-gray-100');
            mapDiv.classList.add('hidden');
            if (map) {
                map.remove();
                map = null;
                marker = null;
            }

        } catch (error) {
            console.error('Error placing order:', error);
            showMessage(`Error placing order: ${error.message}`, 'error');
        }
    }

    /**
     * Fetches and displays the status of a specific order.
     * @param {string} orderId - The order ID or PIN to track.
     */
    async function fetchOrderStatus(orderId) {
        orderTrackingSection.classList.add('hidden'); // Hide before showing new data
        orderTrackingDetails.innerHTML = '<p class="text-center text-gray-500">Loading order status...</p>';
        orderTrackingSection.classList.remove('hidden');

        try {
            const response = await fetch(`${API_BASE_URL}/api/order/${orderId}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Order not found. Please check the ID or PIN.');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const order = await response.json();
            renderOrderStatus(order);
        } catch (error) {
            console.error('Error fetching order status:', error);
            orderTrackingDetails.innerHTML = `<p class="text-red-600">${error.message}</p>`;
        }
    }

    // --- Rendering Functions ---

    /**
     * Renders menu items grouped by category.
     * @param {Array<object>} items - Array of menu item objects.
     */
    function renderMenuItems(items) {
        menuContainer.innerHTML = ''; // Clear previous content
        const categories = {};
        items.forEach(item => {
            const category = item.category || 'Uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        });

        for (const category in categories) {
            const categorySection = document.createElement('div');
            categorySection.className = 'col-span-full'; // Make category title span full width
            categorySection.innerHTML = `<h2 class="text-2xl font-bold text-gray-800 mb-4 mt-6 border-b-2 border-orange-400 pb-2">${category}</h2>`;
            menuContainer.appendChild(categorySection);

            categories[category].forEach(item => {
                const itemCard = document.createElement('div');
                itemCard.className = 'bg-white rounded-lg shadow-md overflow-hidden flex flex-col sm:flex-row items-center p-4 transform transition duration-300 hover:scale-105 hover:shadow-lg';
                itemCard.innerHTML = `
                    <img src="${item.imageUrl || 'https://placehold.co/150x100/cccccc/ffffff?text=No+Image'}" alt="${item.name}" class="w-full sm:w-32 h-32 object-cover rounded-md mb-4 sm:mb-0 sm:mr-4">
                    <div class="flex-grow text-center sm:text-left">
                        <h3 class="text-xl font-semibold text-gray-800">${item.name} ${item.isTrending ? '<span class="text-yellow-500 text-sm ml-1">✨ Trending</span>' : ''}</h3>
                        <p class="text-gray-600 text-sm mb-2">${item.description || 'No description available.'}</p>
                        <p class="text-orange-600 text-lg font-bold">${formatCurrency(item.price)}</p>
                    </div>
                    <button data-id="${item._id}" class="add-to-cart-btn btn-primary mt-4 sm:mt-0 sm:ml-4 flex-shrink-0">Add to Cart</button>
                `;
                menuContainer.appendChild(itemCard);
            });
        }

        // Add event listeners to "Add to Cart" buttons
        document.querySelectorAll('.add-to-cart-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const itemId = event.currentTarget.dataset.id;
                const selectedItem = allMenuItems.find(item => item._id === itemId);
                if (selectedItem) {
                    addToCart(selectedItem);
                }
            });
        });
    }

    /**
     * Renders the details of a single order for tracking.
     * @param {object} order - The order object.
     */
    function renderOrderStatus(order) {
        let itemsHtml = order.items.map(item => `
            <li class="flex justify-between py-1">
                <span class="text-gray-700">${item.name} x ${item.quantity}</span>
                <span class="font-medium">${formatCurrency(item.price * item.quantity)}</span>
            </li>
        `).join('');

        orderTrackingDetails.innerHTML = `
            <p class="mb-2"><span class="font-semibold">Order ID:</span> ${order.customOrderId || order._id}</p>
            <p class="mb-2"><span class="font-semibold">PIN:</span> ${order.pinId}</p>
            <p class="mb-2"><span class="font-semibold">Status:</span> <span class="text-blue-600 font-bold">${order.status}</span></p>
            <p class="mb-2"><span class="font-semibold">Total Amount:</span> ${formatCurrency(order.totalAmount)}</p>
            <p class="mb-2"><span class="font-semibold">Payment Method:</span> ${order.paymentMethod}</p>
            <p class="mb-2"><span class="font-semibold">Order Date:</span> ${new Date(order.orderDate).toLocaleString()}</p>
            <p class="mb-4"><span class="font-semibold">Delivery Address:</span> ${order.deliveryAddress}</p>
            <h4 class="text-lg font-semibold mb-2">Items:</h4>
            <ul class="list-disc pl-5">
                ${itemsHtml}
            </ul>
        `;
    }

    // --- Event Listeners ---

    viewCartBtn.addEventListener('click', () => {
        cartModal.classList.remove('hidden');
        updateCartDisplay(); // Ensure cart display is up-to-date when opened
        // Initialize map only when cart modal is opened and map is not already initialized
        if (!map) {
            initMap();
        } else {
            // Invalidate map size if it was hidden
            map.invalidateSize();
        }
    });

    closeCartModal.addEventListener('click', () => {
        cartModal.classList.add('hidden');
        // Optionally destroy map to free resources if not needed
        // if (map) {
        //     map.remove();
        //     map = null;
        //     marker = null;
        // }
    });

    // Close modal if clicked outside content
    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            cartModal.classList.add('hidden');
        }
    });

    cartItemsList.addEventListener('click', (event) => {
        const target = event.target;
        const itemId = target.dataset.id;
        const action = target.dataset.action;

        if (itemId && action) {
            const itemInCart = cart.find(item => item.itemId === itemId);
            if (!itemInCart) return;

            let newQuantity = itemInCart.quantity;
            if (action === 'increase') {
                newQuantity++;
            } else if (action === 'decrease') {
                newQuantity--;
            } else if (action === 'remove') {
                newQuantity = 0; // Set to 0 to remove
            }
            updateCartQuantity(itemId, newQuantity);
        }
    });

    openMapBtn.addEventListener('click', () => {
        mapDiv.classList.toggle('hidden');
        if (!map) {
            initMap();
        } else {
            map.invalidateSize(); // Important for map to render correctly after being hidden/shown
        }
        // If map is opened, disable manual address input
        if (!mapDiv.classList.contains('hidden')) {
            deliveryAddressInput.readOnly = true;
            deliveryAddressInput.classList.add('bg-gray-100');
        } else {
            // If map is closed, re-enable manual input unless a location was selected
            if (!selectedLocation || !selectedLocation.latitude) {
                deliveryAddressInput.readOnly = false;
                deliveryAddressInput.classList.remove('bg-gray-100');
            }
        }
    });

    checkoutForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (cart.length === 0) {
            showMessage('Your cart is empty. Please add items before placing an order.', 'error');
            return;
        }

        const customerName = customerNameInput.value.trim();
        const customerPhone = customerPhoneInput.value.trim();
        const deliveryAddress = deliveryAddressInput.value.trim(); // This will be from map or manual

        if (!customerName || !customerPhone || !deliveryAddress) {
            showMessage('Please fill in all delivery details.', 'error');
            return;
        }

        // Basic phone number validation (10 digits for India, or 12 if including 91 prefix)
        const phoneRegex = /^(91)?[6789]\d{9}$/; // Allows 10 digits or 91 + 10 digits
        if (!phoneRegex.test(customerPhone)) {
            showMessage('Please enter a valid 10-digit Indian phone number, optionally prefixed with 91 (e.g., 919876543210 or 9876543210).', 'error');
            return;
        }

        // Ensure location data is present if map was used
        if (map && !mapDiv.classList.contains('hidden') && (!selectedLocation || !selectedLocation.latitude)) {
            showMessage('Please select your delivery location on the map.', 'error');
            return;
        }

        // If map was not used, or if no location was selected via map, use default location or try to geocode manual address
        let finalCustomerLocation = selectedLocation;
        if (!finalCustomerLocation || !finalCustomerLocation.latitude) {
            // If map was not used or no location selected, try to use a default or assume address is text only
            finalCustomerLocation = {
                latitude: 0, // Default or estimate from address if needed
                longitude: 0, // Default or estimate from address if needed
                address: deliveryAddress
            };
        }

        const { subtotal, transportTax, discountAmount, totalAmount } = calculateCartTotals();

        const orderData = {
            items: cart.map(item => ({ productId: item.itemId, quantity: item.quantity })),
            customerName,
            customerPhone,
            deliveryAddress,
            customerLocation: finalCustomerLocation,
            subtotal,
            transportTax,
            discountAmount,
            totalAmount,
            paymentMethod: 'Cash on Delivery' // Hardcoded as per backend logic
        };

        await placeOrder(orderData);
    });

    closeMessageBtn.addEventListener('click', hideMessage);

    closeOrderTrackingBtn.addEventListener('click', () => {
        orderTrackingSection.classList.add('hidden');
        // Remove orderId from URL if present
        const url = new URL(window.location.href);
        if (url.searchParams.has('orderId')) {
            url.searchParams.delete('orderId');
            window.history.replaceState({}, document.title, url.toString());
        }
    });

    // --- Initialization ---
    async function init() {
        await fetchPublicSettings();
        await fetchMenuItems();
        updateCartDisplay(); // Initialize cart display

        // Load saved customer info
        customerNameInput.value = localStorage.getItem('customerName') || '';
        customerPhoneInput.value = localStorage.getItem('customerPhone') || '';
        deliveryAddressInput.value = localStorage.getItem('deliveryAddress') || '';
        const storedLat = localStorage.getItem('deliveryLat');
        const storedLon = localStorage.getItem('deliveryLon');

        if (storedLat && storedLon) {
            selectedLocation = {
                latitude: parseFloat(storedLat),
                longitude: parseFloat(storedLon),
                address: localStorage.getItem('deliveryAddress') || ''
            };
            deliveryLatInput.value = storedLat;
            deliveryLonInput.value = storedLon;
            deliveryAddressInput.readOnly = true;
            deliveryAddressInput.classList.add('bg-gray-100');
        } else {
            deliveryAddressInput.readOnly = false;
            deliveryAddressInput.classList.remove('bg-gray-100');
        }

        // Check for orderId in URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const orderIdFromUrl = urlParams.get('orderId');
        if (orderIdFromUrl) {
            await fetchOrderStatus(orderIdFromUrl);
        }
    }

    init();
});

