const galleryItems = [
  {
    id: "resume",
    title: "Tahsin Anan Resume",
    type: "Resume PDF",
    filter: "media",
    format: "pdf",
    src: "assets/previews/resume-preview.png",
    original: "assets/resume-tahsin-anan.pdf",
    ratio: "3 / 4",
    description: "Full resume with education, marketing experience, work experience, leadership, tools, languages, and certificates."
  },
  {
    id: "calx",
    title: "CALX Brand Intro",
    type: "Brand Identity",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/calx-brand-intro.jpg",
    ratio: "1 / 1",
    description: "A conceptual identity piece pairing detailed illustration with a clean brand reveal."
  },
  {
    id: "explore-kickoff",
    title: "Success Amplified Explore Kickoff",
    type: "Student Program Flyer",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/explore-kickoff-flyer.jpg",
    ratio: "3 / 4",
    description: "Program collateral built around student benefits, event logistics, and high-contrast hierarchy."
  },
  {
    id: "major-direction",
    title: "Your Major. Your Direction.",
    type: "Campaign Flyer",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/major-direction-flyer.jpg",
    ratio: "4 / 5",
    description: "Campus-facing campaign asset focused on major exploration, career confidence, and next steps."
  },
  {
    id: "labor-market",
    title: "Labor Market Trends",
    type: "PDF Event Collateral",
    filter: "media",
    format: "pdf",
    src: "assets/previews/labor-market-trends-preview.png",
    original: "assets/graphics/labor-market-trends.pdf",
    ratio: "3 / 4",
    description: "A career event handout connecting student decisions to practical labor market insight."
  },
  {
    id: "success-passport",
    title: "Success Amplified Passport",
    type: "PDF Program Handout",
    filter: "media",
    format: "pdf",
    src: "assets/previews/success-passport-preview.png",
    original: "assets/graphics/success-passport.pdf",
    ratio: "4 / 3",
    description: "A checklist-style program passport that makes participation requirements easier to track."
  },
  {
    id: "success-logo",
    title: "Success Amplified Explore Logo",
    type: "Logo Design",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/success-amplified-logo.png",
    ratio: "1 / 1",
    description: "A badge-style mark for a student exploration initiative, designed for recognition across collateral."
  },
  {
    id: "dnrcast",
    title: "DNRcast App Preview",
    type: "Motion / App Promotion",
    filter: "media",
    format: "video",
    src: "assets/graphics/dnrcast-app-preview.mp4",
    poster: "assets/previews/dnrcast-preview.png",
    ratio: "9 / 16",
    description: "A product preview for a podcast-style mobile app experience with bold entertainment positioning."
  },
  {
    id: "project-progoti",
    title: "Project Progoti Ramadan Campaign",
    type: "Community Campaign",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/project-progoti-campaign.jpg",
    ratio: "1 / 1",
    description: "A social-impact campaign visual supporting Project Kritoggo and Progoti Foundation fundraising."
  },
  {
    id: "ramadan-donation",
    title: "Iftaar Donation Post",
    type: "Fundraising Social Post",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/ramadan-donation-post.jpg",
    ratio: "1 / 1",
    description: "A donation-focused social asset that centers the beneficiary while keeping payment options visible."
  },
  {
    id: "gratitude-games",
    title: "Gratitude & Games",
    type: "Event Flyer",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/gratitude-games-flyer.jpg",
    ratio: "3 / 4",
    description: "A warm seasonal event flyer with a playful, community-centered visual tone."
  },
  {
    id: "blooming-together",
    title: "Blooming Together",
    type: "Event Flyer",
    filter: "graphics",
    format: "image",
    src: "assets/graphics/blooming-together-flyer.jpg",
    ratio: "3 / 4",
    description: "A spring event poster using soft illustration, friendly type, and easy-to-scan logistics."
  },
  ...[
    "IMG_0704",
    "IMG_0705",
    "IMG_0707",
    "IMG_0708",
    "IMG_0709",
    "IMG_0710",
    "IMG_0711",
    "IMG_0715",
    "IMG_0716",
    "IMG_0717",
    "IMG_0718",
    "IMG_0719",
    "IMG_0720",
    "IMG_0721",
    "IMG_0722",
    "IMG_0723",
    "IMG_0724",
    "IMG_0725",
    "IMG_0726"
  ].map((name, index) => ({
    id: name.toLowerCase(),
    title: `Original Artwork ${String(index + 1).padStart(2, "0")}`,
    type: "Artwork Study",
    filter: "artwork",
    format: "image",
    src: `assets/artworks/${name}.jpg`,
    ratio: index % 5 === 0 ? "1 / 1" : index % 4 === 0 ? "3 / 4" : "4 / 3",
    description: "Original artwork included to show hand-rendering, composition, and visual range."
  }))
];

const galleryGrid = document.querySelector("#gallery-grid");
const filterButtons = document.querySelectorAll(".filter-button");
const lightbox = document.querySelector("#lightbox");
const lightboxMedia = document.querySelector("#lightbox-media");
const lightboxType = document.querySelector("#lightbox-type");
const lightboxTitle = document.querySelector("#lightbox-title");
const lightboxDescription = document.querySelector("#lightbox-description");
const lightboxLink = document.querySelector("#lightbox-link");
const lightboxWindowTitle = document.querySelector("#lightbox-window-title");
const closeButton = document.querySelector(".close-button");
const clock = document.querySelector("#clock");

function renderGallery() {
  galleryGrid.innerHTML = galleryItems
    .map((item) => {
      const imageSource = item.format === "video" ? item.poster : item.src;
      return `
        <article class="gallery-card" data-filter="${item.filter}" data-id="${item.id}" tabindex="0">
          <div class="gallery-thumb ${item.format}" style="--ratio: ${item.ratio}">
            <img src="${imageSource}" alt="${item.title}" loading="lazy">
          </div>
          <div class="gallery-caption">
            <p>${item.type}</p>
            <h3>${item.title}</h3>
          </div>
        </article>
      `;
    })
    .join("");
}

function setFilter(filter) {
  document.querySelectorAll(".gallery-card").forEach((card) => {
    const shouldShow = filter === "all" || card.dataset.filter === filter;
    card.classList.toggle("hidden", !shouldShow);
  });

  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });
}

function openLightbox(id) {
  const item = galleryItems.find((entry) => entry.id === id);
  if (!item) return;

  const media =
    item.format === "video"
      ? `<video src="${item.src}" poster="${item.poster}" controls autoplay muted loop playsinline></video>`
      : `<img src="${item.src}" alt="${item.title}">`;

  lightboxMedia.innerHTML = media;
  lightboxType.textContent = item.type;
  lightboxTitle.textContent = item.title;
  lightboxDescription.textContent = item.description;
  lightboxLink.href = item.original || item.src;
  lightboxLink.textContent = item.format === "pdf" ? "open full PDF" : "open original file";
  lightboxWindowTitle.textContent = `${item.id}.preview`;

  if (typeof lightbox.showModal === "function") {
    lightbox.showModal();
  }
}

function updateClock() {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
  clock.textContent = `${date} ${time}`;
  clock.dateTime = now.toISOString();
}

function activateWindow(event) {
  const selectedWindow = event.target.closest("[data-window]");
  if (!selectedWindow) return;

  document.querySelectorAll("[data-window]").forEach((win) => {
    win.style.zIndex = "1";
  });
  selectedWindow.style.zIndex = "2";
}

renderGallery();
updateClock();
setInterval(updateClock, 30000);
document.addEventListener("pointerdown", activateWindow);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

galleryGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".gallery-card");
  if (card) openLightbox(card.dataset.id);
});

galleryGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".gallery-card");
  if (!card) return;
  event.preventDefault();
  openLightbox(card.dataset.id);
});

document.querySelectorAll("[data-gallery-target]").forEach((button) => {
  button.addEventListener("click", () => openLightbox(button.dataset.galleryTarget));
});

closeButton.addEventListener("click", () => lightbox.close());

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    lightbox.close();
  }
});

lightbox.addEventListener("close", () => {
  lightboxMedia.innerHTML = "";
});
