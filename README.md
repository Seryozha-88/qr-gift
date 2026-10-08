# QR Gift Generator 🎁

A simple web application that allows you to create personalized gift pages with text, images, and audio files. Each gift page gets a unique URL that's converted into a QR code for easy sharing.

## Features

- 📝 Add custom text messages
- 🖼️ Upload images
- 🎵 Upload MP3 audio files
- 🔗 Generate unique URLs for each gift page
- 📱 Automatic QR code generation
- 👨‍💼 Admin panel for creating and managing gift pages
- 📊 View all created gift pages

## Installation

1. Install dependencies:
```bash
npm install
```

## Creating gifts (shop staff)

Open the admin page in any browser, on a computer or a phone:
**https://seryozha-88.github.io/qr-gift/admin/**

1. The first time, sign in with a GitHub token (the page shows the steps):
   your GitHub account must be added to this repository, and the token is a
   *classic* token with only `public_repo` ticked. Fine-grained tokens do not work
   for collaborators on a personal account's repository.
2. Write the message, add an image and/or audio, and click **Create Gift & QR Code**.
3. Download the QR code. It starts working about a minute later; the page shows ✅ Live when it does.
4. The list below the form shows every gift on the site, with buttons to open it, download its QR code again, or delete it.

Each gift is a commit to `docs/gift/<id>/` on `main`, made with the staff member's own token;
GitHub Pages republishes the site from `docs/` after every commit.

**Everything in `docs/` is public**: anyone can browse the repository and see every gift, and deleted gifts stay in the git history.
The site is limited to 1 GB (the admin page shows how much is used).

## Adding or removing staff (repository owner)

- Add: Settings → Collaborators → **Add people** → their GitHub username → Write. They accept the email invitation, then follow the steps above.
- Remove: delete them from Collaborators. Their token stops working for this repository immediately.

One-time setup (already done): Settings → Pages → Source "Deploy from a branch", branch `main`, folder `/docs`.

## Creating gifts from a computer (developers)

`npm run admin` runs the original admin panel locally with QR codes pointing to the published site,
and `npm run deploy` publishes the gifts created there (`docs/` is updated, committed and pushed).
Gifts created this way are kept in `data/` and `uploads/` on that computer; deploying never removes gifts published by others.

## Usage (server)

`npm start` runs the same app as a normal web server (QR codes point to the server itself).
Set `ADMIN_KEY`, and `STORAGE_DIR` to a persistent location; see `Dockerfile` for container deployments.

## How It Works

1. Go to the admin panel
2. Enter your gift message text
3. Upload an image (optional)
4. Upload an audio file (optional)
5. Click "Generate Gift Page & QR Code"
6. Get a unique URL and QR code
7. Share the QR code with your recipient
8. They scan it and see your personalized gift page!

## Project Structure

```
qr-gift/
├── server.js           # Express server (admin panel and local preview)
├── export.js           # Builds the static GitHub Pages site into docs/
├── docs/               # Published site; docs/admin/ is the staff admin page
├── package.json        # Dependencies
├── public/            # Static files
│   ├── index.html     # Home page
│   ├── admin.html     # Admin panel
│   ├── gift.html      # Gift page template
│   ├── admin.js       # Admin panel logic
│   ├── gift.js        # Gift page logic
│   └── styles.css     # Styling
├── uploads/           # Uploaded files (created automatically)
│   ├── images/
│   └── audio/
└── data/              # JSON database (created automatically)
    └── pages.json
```

## Technologies Used

- Node.js + Express
- Multer (file uploads)
- QRCode (QR generation)
- UUID (unique IDs)
- Vanilla JavaScript
- CSS3

## License

MIT
