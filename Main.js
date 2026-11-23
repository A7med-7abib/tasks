// ==========================================
// VIEW TEC TASK TRACKER
// Supabase Integration
// ==========================================

// ===== App State =====

let deliveries = [];

let currentMonthFilter = "all";
let currentDateSort = "desc";
let editingId = null;


// ===== Helpers =====

function getDayName(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    weekday: "long"
  });
}


// ===== Supabase Database Functions =====

// Fetch all tasks
async function fetchDeliveries() {

  const { data, error } = await window.db
    .from("deliveries")
    .select("*")
    .order("delivery_date", {
      ascending: false
    });

  if (error) {
    console.error("Fetch Error:", error);
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    date: row.delivery_date,
    days: row.delivery_day,
    cost: Number(row.delivery_cost) || 0,
    serial: row.serial_number || "",
    center: row.center_name || "",
    product: row.product_name || "",
    image: row.image_url || "",
    doctor: row.serial_number || "",
    engineer: "",
    stops: [{ name: row.serial_number || "" }]
  }));
}


// ==========================================
// Upload Image to Supabase Storage
// ==========================================

async function uploadTaskImage(file) {
  if (!file) return null;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG and WEBP images are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image size must be less than 5 MB.");
  }

  if (!window.db) {
    throw new Error("Supabase client is not initialized.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const filePath = `${crypto.randomUUID()}.${extension}`;

  const { data, error } = await window.db.storage
    .from("delivery-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) {
    console.error("Image Upload Error:", error);
    throw error;
  }

  const { data: publicData } = window.db.storage
    .from("delivery-images")
    .getPublicUrl(data.path);

  if (!publicData?.publicUrl) {
    throw new Error("Could not generate the public image URL.");
  }

  return publicData.publicUrl;
}


// Insert new task
async function insertDelivery(delivery) {
  const newTask = {
    delivery_date: delivery.date,
    delivery_day: delivery.days,
    delivery_cost: delivery.cost,
    serial_number: delivery.serial,
    center_name: delivery.center,
    product_name: delivery.product,
    image_url: delivery.image || null
  };

  const { data, error } = await window.db
    .from("deliveries")
    .insert([newTask])
    .select()
    .single();

  if (error) {
    console.error("Insert Error:", error);
    throw error;
  }

  return {
    id: data.id,
    date: data.delivery_date,
    days: data.delivery_day,
    cost: Number(data.delivery_cost) || 0,
    serial: data.serial_number || "",
    center: data.center_name || "",
    product: data.product_name || "",
    image: data.image_url || "",
    doctor: data.serial_number || "",
    engineer: "",
    stops: [{ name: data.serial_number || "" }]
  };
}


// ===== Initialize =====

document.addEventListener("DOMContentLoaded", async () => {

  const today = new Date().toISOString().split("T")[0];

  const dateInput = document.getElementById("deliveryDate");
  const dayInput = document.getElementById("deliveryDays");

  if (dateInput) {

    dateInput.value = today;

    dateInput.addEventListener("change", (event) => {

      if (event.target.value && dayInput) {
        dayInput.value = getDayName(event.target.value);
      }

    });
  }

  if (dayInput && !dayInput.value) {
    dayInput.value = getDayName(today);
  }

  try {

    deliveries = await fetchDeliveries();

    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();

    console.log("Tasks loaded successfully:", deliveries);

  } catch (error) {

    console.error("Failed to load tasks:", error);

    showToast("Could not load tasks from database");

  }

});


// ===== Form Toggle =====

function toggleForm() {

  const body = document.getElementById("formBody");
  const icon = document.getElementById("formToggleIcon");

  body.classList.toggle("collapsed");
  icon.classList.toggle("rotated");

}


// ===== Route Stops Management =====

function addStop() {

  const container = document.getElementById("stopsContainer");

  if (!container) return;

  const stops = container.querySelectorAll(".stop-item");

  const newIndex = stops.length + 1;

  const segmentEl = document.createElement("div");

  segmentEl.className = "route-segment";

  segmentEl.innerHTML = `
    <div class="segment-line"></div>
    <div class="segment-cost">
      <span class="segment-cost-icon">
        <i class="bi bi-cash-coin"></i>
      </span>
      <input
        type="number"
        class="segment-cost-input"
        placeholder="Cost to next stop..."
        min="0"
        step="0.01"
        oninput="calculateTotalCost()"
      />
    </div>
  `;

  const stopEl = document.createElement("div");

  stopEl.className = "stop-item";
  stopEl.setAttribute("data-stop", newIndex);

  stopEl.innerHTML = `
    <div class="stop-marker mid">
      <span>${newIndex}</span>
    </div>

    <input
      type="text"
      class="stop-input stop-name"
      placeholder="Stop ${newIndex}..."
    >

    <button
      class="btn-remove-stop"
      onclick="removeStop(this)"
      title="Remove"
    >✕</button>
  `;

  const lastStop = stops[stops.length - 1];

  if (!lastStop) return;

  container.insertBefore(stopEl, lastStop);
  container.insertBefore(segmentEl, lastStop);

  updateStopNumbers();
  updateRemoveButtons();

}


function removeStop(btn) {

  const stopItem = btn.closest(".stop-item");

  const prevSegment = stopItem.previousElementSibling;

  if (prevSegment && prevSegment.classList.contains("route-segment")) {

    prevSegment.remove();

  } else {

    const nextSegment = stopItem.nextElementSibling;

    if (nextSegment && nextSegment.classList.contains("route-segment")) {
      nextSegment.remove();
    }

  }

  stopItem.style.animation = "slideOut 0.3s ease forwards";

  setTimeout(() => {

    stopItem.remove();

    updateStopNumbers();
    updateRemoveButtons();
    calculateTotalCost();

  }, 300);

}


function calculateTotalCost() {

  const costInputs = document.querySelectorAll(
    "#stopsContainer .segment-cost-input"
  );

  let total = 0;

  costInputs.forEach((input) => {
    total += parseFloat(input.value) || 0;
  });

  const costInput = document.getElementById("deliveryCost");

  if (costInput) {
    costInput.value = total.toFixed(2);
  }

}


function updateStopNumbers() {

  const container = document.getElementById("stopsContainer");

  if (!container) return;

  const stops = container.querySelectorAll(".stop-item");

  stops.forEach((stop, i) => {

    const marker = stop.querySelector(".stop-marker");

    const span = marker.querySelector("span");

    span.textContent = i + 1;

    marker.className = "stop-marker";

    if (i === 0) {

      marker.classList.add("start");

    } else if (i === stops.length - 1) {

      marker.classList.add("end");

    } else {

      marker.classList.add("mid");

    }

    stop.setAttribute("data-stop", i + 1);

  });

}


function updateRemoveButtons() {

  const container = document.getElementById("stopsContainer");

  if (!container) return;

  const stops = container.querySelectorAll(".stop-item");

  const removeBtns = container.querySelectorAll(".btn-remove-stop");

  removeBtns.forEach((btn) => {

    btn.style.display = stops.length > 2 ? "flex" : "none";

  });

}


// ===== Save Delivery =====

async function saveDelivery() {
  const date = document.getElementById("deliveryDate").value;
  const days = document.getElementById("deliveryDays").value.trim();
  const cost = parseFloat(document.getElementById("deliveryCost").value) || 0;
  const serial = document.getElementById("serialNumber").value.trim();
  const center = document.getElementById("centerName").value.trim();
  const product = document.getElementById("productName").value.trim();

  const imageInput = document.getElementById("taskImage");
  const imageFile = imageInput?.files?.[0] || null;

  if (!date) {
    showToast("Please select a date");
    return;
  }

  if (!serial) {
    showToast("Please enter a serial number");
    document.getElementById("serialNumber").focus();
    return;
  }

  if (!center) {
    showToast("Please enter a center name");
    document.getElementById("centerName").focus();
    return;
  }

  if (!product) {
    showToast("Please enter a product name");
    document.getElementById("productName").focus();
    return;
  }

  const btn = document.getElementById("btnSubmit");

  if (!btn) {
    showToast("Save button was not found");
    return;
  }

  const originalButtonText = btn.textContent;

  btn.textContent = imageFile ? "Uploading image..." : "Saving...";
  btn.disabled = true;

  let uploadedImagePath = null;

  try {

    // Upload image first (if the user selected one).
    let imageUrl = null;

    if (imageFile) {

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      if (!allowedTypes.includes(imageFile.type)) {
        throw new Error("Only JPG, PNG and WEBP images are allowed.");
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        throw new Error("Image size must be less than 5 MB.");
      }

      const extension = imageFile.name.split(".").pop().toLowerCase();

      uploadedImagePath = `${crypto.randomUUID()}.${extension}`;

      const { data: uploadData, error: uploadError } = await window.db.storage
        .from("delivery-images")
        .upload(uploadedImagePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: imageFile.type
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = window.db.storage
        .from("delivery-images")
        .getPublicUrl(uploadData.path);

      imageUrl = publicData?.publicUrl;

      if (!imageUrl) {
        throw new Error("Could not generate the public image URL.");
      }
    }

    const task = {
      date,
      days,
      cost,
      serial,
      center,
      product,
      image: imageUrl
    };

    btn.textContent = "Saving task...";

    const inserted = await insertDelivery(task);

    deliveries.unshift(inserted);

    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
    resetForm();

    showToast("Task saved successfully!");

    console.log("Inserted Task:", inserted);

  } catch (error) {

    console.error("Save Error:", error);

    // Remove the uploaded image if saving the database row failed.
    if (uploadedImagePath) {

      const { error: removeError } = await window.db.storage
        .from("delivery-images")
        .remove([uploadedImagePath]);

      if (removeError) {
        console.error("Image cleanup error:", removeError);
      }

    }

    showToast(error.message || "Failed to save task. Please try again.");

  } finally {

    btn.textContent = originalButtonText || "Save Task";
    btn.disabled = false;

  }
}


// ===== Image Reader (Storage Integration Later) =====

function readImageFile(input) {

  return new Promise((resolve) => {

    const file = input && input.files && input.files[0];

    if (!file) return resolve("");

    if (file.size > 2 * 1024 * 1024) {

      showToast("Please choose an image smaller than 2 MB");

      return resolve("");

    }

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);

    reader.onerror = () => resolve("");

    reader.readAsDataURL(file);

  });

}


// ===== Reset Form =====

function resetForm() {

  const today = new Date().toISOString().split("T")[0];

  document.getElementById("deliveryDate").value = today;

  document.getElementById("deliveryDays").value = getDayName(today);

  document.getElementById("deliveryCost").value = "0.00";

  document.getElementById("serialNumber").value = "";

  document.getElementById("centerName").value = "";

  document.getElementById("productName").value = "";

  document.getElementById("taskImage").value = "";

}


// ===== Render Deliveries =====

function renderDeliveries() {

  const list = document.getElementById("deliveriesList");

  const emptyState = document.getElementById("emptyState");

  const searchInput = document.getElementById("searchInput");

  if (!list || !emptyState || !searchInput) return;

  const searchTerm = searchInput.value.toLowerCase();

  let filtered = [...deliveries];


  // Filter by month

  if (currentMonthFilter !== "all") {

    filtered = filtered.filter(
      (d) => d.date && d.date.startsWith(currentMonthFilter)
    );

  }


  // Search

  if (searchTerm) {

    filtered = filtered.filter((d) => {

      const serial = d.serial || "";
      const center = d.center || "";
      const product = d.product || "";
      const day = d.days || "";

      return (
        serial.toLowerCase().includes(searchTerm) ||
        center.toLowerCase().includes(searchTerm) ||
        product.toLowerCase().includes(searchTerm) ||
        String(day).toLowerCase().includes(searchTerm)
      );

    });

  }


  // Sort by date

  filtered.sort((a, b) => {

    const timeA = a.date ? new Date(a.date).getTime() : 0;

    const timeB = b.date ? new Date(b.date).getTime() : 0;

    if (currentDateSort === "asc") {
      return timeA - timeB;
    }

    return timeB - timeA;

  });


  // Empty State

  if (filtered.length === 0) {

    list.innerHTML = "";

    emptyState.classList.add("show");

    return;

  }

  emptyState.classList.remove("show");


  // Render Cards

  list.innerHTML = filtered.map((d) => {

    const formattedDate = formatDate(d.date);

    const serial = d.serial || "—";

    const center = d.center || "";

    const imageHtml = d.image
      ? `
        <img
          class="task-image"
          src="${escapeHtml(d.image)}"
          alt="${escapeHtml(center || "Task")} image"
          loading="lazy"
        />
      `
      : "";


    return `
      <div class="delivery-card" id="card-${d.id}">

        <div class="delivery-card-header">

          <div class="delivery-card-info">

            <h3>${escapeHtml(serial)}</h3>

            <div class="delivery-card-date">
              ${escapeHtml(center)}
              &nbsp;•&nbsp;
              ${formattedDate}
              ${d.days ? ` &nbsp;•&nbsp; ${escapeHtml(String(d.days))}` : ""}
              &nbsp;•&nbsp;
              Cost: ${d.cost || 0}
            </div>

          </div>

          <div class="delivery-card-actions">
            <button
              type="button"
              class="btn-action"
              onclick="openEditModal('${String(d.id).replace(/'/g, "\\'")}')"
              title="Edit task"
            >
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button
              type="button"
              class="btn-action delete"
              onclick="deleteDelivery('${String(d.id).replace(/'/g, "\\'")}')"
              title="Delete task"
            >
              <i class="bi bi-trash"></i> Delete
            </button>
          </div>

        </div>

        ${imageHtml}

      </div>
    `;

  }).join("");

}


// ===== Edit Task =====

function openEditModal(id) {
  const delivery = deliveries.find((item) => String(item.id) === String(id));

  if (!delivery) {
    showToast("Task not found");
    return;
  }

  editingId = delivery.id;

  const modal = document.getElementById("editModal");
  const body = document.getElementById("modalBody");

  if (!modal || !body) return;

  body.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label for="editDate">Date</label>
        <input type="date" id="editDate" value="${escapeHtml(delivery.date || "")}" required />
      </div>
      <div class="form-group">
        <label for="editDays">Day</label>
        <input type="text" id="editDays" value="${escapeHtml(delivery.days || "")}" />
      </div>
      <div class="form-group">
        <label for="editCost">Cost</label>
        <input type="number" id="editCost" min="0" step="0.01" value="${delivery.cost || 0}" />
      </div>
      <div class="form-group">
        <label for="editSerial">Serial Number</label>
        <input type="text" id="editSerial" value="${escapeHtml(delivery.serial || "")}" required />
      </div>
      <div class="form-group">
        <label for="editCenter">Center Name</label>
        <input type="text" id="editCenter" value="${escapeHtml(delivery.center || "")}" required />
      </div>
      <div class="form-group">
        <label for="editProduct">Product Name</label>
        <input type="text" id="editProduct" value="${escapeHtml(delivery.product || "")}" required />
      </div>
      <div class="form-group form-group-full">
        <label for="editImage">Replace Image</label>
        <input type="file" id="editImage" accept="image/jpeg,image/png,image/webp" />
      </div>
    </div>
    <button type="button" class="btn-submit" id="btnUpdate" onclick="updateDelivery()">Update Task</button>
  `;

  document.getElementById("editDate")?.addEventListener("change", (event) => {
    document.getElementById("editDays").value = event.target.value
      ? getDayName(event.target.value)
      : "";
  });

  modal.classList.add("show");
}


function closeEditModal() {
  editingId = null;
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("show");
}


async function updateDelivery() {
  if (editingId === null) return;

  const taskId = editingId;
  const date = document.getElementById("editDate").value;
  const days = document.getElementById("editDays").value.trim();
  const cost = parseFloat(document.getElementById("editCost").value) || 0;
  const serial = document.getElementById("editSerial").value.trim();
  const center = document.getElementById("editCenter").value.trim();
  const product = document.getElementById("editProduct").value.trim();
  const imageFile = document.getElementById("editImage")?.files?.[0] || null;

  if (!date || !serial || !center || !product) {
    showToast("Please complete all required fields");
    return;
  }

  const button = document.getElementById("btnUpdate");
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = imageFile ? "Uploading image..." : "Updating...";
  }

  let uploadedPath = null;
  const oldDelivery = deliveries.find((item) => String(item.id) === String(taskId));

  try {
    let imageUrl = oldDelivery?.image || null;

    if (imageFile) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(imageFile.type)) {
        throw new Error("Only JPG, PNG and WEBP images are allowed.");
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        throw new Error("Image size must be less than 5 MB.");
      }

      const extension = imageFile.name.split(".").pop().toLowerCase();
      uploadedPath = `${crypto.randomUUID()}.${extension}`;
      const { data, error } = await window.db.storage
        .from("delivery-images")
        .upload(uploadedPath, imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: imageFile.type
        });
      if (error) throw error;

      const { data: publicData } = window.db.storage
        .from("delivery-images")
        .getPublicUrl(data.path);
      imageUrl = publicData?.publicUrl;
      if (!imageUrl) throw new Error("Could not generate the public image URL.");
    }

    const updates = {
      delivery_date: date,
      delivery_day: days,
      delivery_cost: cost,
      serial_number: serial,
      center_name: center,
      product_name: product,
      image_url: imageUrl
    };

    const { data, error } = await window.db
      .from("deliveries")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();
    if (error) throw error;

    const updated = {
      id: data.id,
      date: data.delivery_date,
      days: data.delivery_day,
      cost: Number(data.delivery_cost) || 0,
      serial: data.serial_number || "",
      center: data.center_name || "",
      product: data.product_name || "",
      image: data.image_url || "",
      doctor: data.serial_number || "",
      engineer: "",
      stops: [{ name: data.serial_number || "" }]
    };

    deliveries = deliveries.map((item) =>
      String(item.id) === String(taskId) ? updated : item
    );

    if (String(editingId) === String(taskId)) {
      closeEditModal();
    }
    if (uploadedPath && oldDelivery?.image) {
      const oldPath = getStorageObjectPath(oldDelivery.image);
      if (oldPath) {
        const { error: removeError } = await window.db.storage
          .from("delivery-images")
          .remove([oldPath]);
        if (removeError) console.error("Old image cleanup error:", removeError);
      }
    }
    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
    showToast("Task updated successfully!");
  } catch (error) {
    console.error("Update Error:", error);
    if (uploadedPath) {
      await window.db.storage.from("delivery-images").remove([uploadedPath]);
    }
    showToast(error.message || "Failed to update task");
  } finally {
    if (button) {
      button.textContent = originalText || "Update Task";
      button.disabled = false;
    }
  }
}


// ===== Delete Task =====

async function deleteDelivery(id) {
  const delivery = deliveries.find((item) => String(item.id) === String(id));
  if (!delivery) return;

  if (!window.confirm(`Delete task "${delivery.serial || "this task"}"?`)) return;

  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.add("removing");

  try {
    const { error } = await window.db
      .from("deliveries")
      .delete()
      .eq("id", id);
    if (error) throw error;

    if (delivery.image) {
      const imagePath = getStorageObjectPath(delivery.image);
      if (imagePath) {
        const { error: removeError } = await window.db.storage
          .from("delivery-images")
          .remove([imagePath]);
        if (removeError) console.error("Image cleanup error:", removeError);
      }
    }

    deliveries = deliveries.filter((item) => String(item.id) !== String(id));
    updateMonthFilterOptions();
    renderDeliveries();
    updateStats();
    showToast("Task deleted successfully!");
  } catch (error) {
    console.error("Delete Error:", error);
    if (card) card.classList.remove("removing");
    showToast(error.message || "Failed to delete task");
  }
}


// ===== Filter & Sort =====

function changeDateSort(sortOrder) {

  currentDateSort = sortOrder;

  renderDeliveries();

}


function filterByMonth(month) {

  currentMonthFilter = month;

  renderDeliveries();

}


function updateMonthFilterOptions() {

  const select = document.getElementById("monthFilter");

  if (!select) return;

  const currentVal = select.value || "all";

  const monthsSet = new Set();

  deliveries.forEach((d) => {

    if (d.date && typeof d.date === "string" && d.date.length >= 7) {

      monthsSet.add(d.date.substring(0, 7));

    }

  });

  const sortedMonths = Array.from(monthsSet).sort().reverse();

  let options = `<option value="all">All Months</option>`;

  sortedMonths.forEach((m) => {

    const parts = m.split("-");

    const year = parseInt(parts[0]);

    const month = parseInt(parts[1]);

    const dateObj = new Date(year, month - 1, 1);

    const monthName = dateObj.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric"
    });

    options += `<option value="${m}">${monthName}</option>`;

  });

  select.innerHTML = options;

  if (sortedMonths.includes(currentVal)) {

    select.value = currentVal;

    currentMonthFilter = currentVal;

  } else {

    select.value = "all";

    currentMonthFilter = "all";

  }

}


// ===== Export to Excel / CSV =====

function exportToExcel() {

  if (!deliveries || deliveries.length === 0) {

    showToast("No tasks to export");

    return;

  }

  const headers = [
    "Date",
    "Day",
    "Serial Number",
    "Center Name",
    "Product Name",
    "Cost"
  ];

  const rows = deliveries.map((d) => [

    `"${d.date || ""}"`,

    `"${d.days || ""}"`,

    `"${String(d.serial || "").replace(/"/g, '""')}"`,

    `"${String(d.center || "").replace(/"/g, '""')}"`,

    `"${String(d.product || "").replace(/"/g, '""')}"`,

    `"${d.cost || 0}"`

  ]);

  const csvContent =
    "\uFEFF" +
    [headers.join(","), ...rows.map((r) => r.join(","))]
      .join("\r\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  const today = new Date().toISOString().split("T")[0];

  link.setAttribute("href", url);

  link.setAttribute("download", `VIEW_TEC_Tasks_${today}.csv`);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  showToast("Excel export downloaded!");

}


// ===== Print Report =====

function printReport() {

  window.print();

}


// ===== Search =====

function filterDeliveries() {

  renderDeliveries();

}


// ===== Statistics =====

function updateStats() {

  const total = deliveries.length;

  const today = new Date().toISOString().split("T")[0];

  const todayCount = deliveries.filter(
    (d) => d.date === today
  ).length;

  const uniqueSerials = new Set(
    deliveries.map((d) => d.serial.toLowerCase())
  ).size;

  animateNumber("totalDeliveries", total);

  animateNumber("todayDeliveries", todayCount);

  animateNumber("totalDoctors", uniqueSerials);

}


function animateNumber(elementId, target) {

  const el = document.getElementById(elementId);

  if (!el) return;

  const current = parseInt(el.textContent) || 0;

  const diff = target - current;

  const steps = 20;

  const stepTime = 30;

  let step = 0;

  if (diff === 0) return;

  const interval = setInterval(() => {

    step++;

    const progress = step / steps;

    const eased = 1 - Math.pow(1 - progress, 3);

    el.textContent = Math.round(current + diff * eased);

    if (step >= steps) {

      el.textContent = target;

      clearInterval(interval);

    }

  }, stepTime);

}


// ===== Format Date =====

function formatDate(dateStr) {

  if (!dateStr) return "";

  const date = new Date(dateStr + "T00:00:00");

  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short"
  };

  return date.toLocaleDateString("en-US", options);

}


// ===== Escape HTML =====

function escapeHtml(str) {

  const div = document.createElement("div");

  div.textContent = str;

  return div.innerHTML;

}


function getStorageObjectPath(publicUrl) {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = "/storage/v1/object/public/delivery-images/";
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) return null;

    return decodeURIComponent(url.pathname.substring(markerIndex + marker.length));
  } catch (error) {
    console.error("Invalid image URL:", error);
    return null;
  }
}


// ===== Toast Notification =====

let toastTimer;

function showToast(message) {

  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    toast.classList.remove("show");

  }, 2500);

}


// ===== Keyboard Shortcuts =====

document.addEventListener("keydown", (e) => {

  if (e.key === "Escape") {

    closeEditModal();

  }

  if (e.ctrlKey && e.key === "Enter") {

    saveDelivery();

  }

});