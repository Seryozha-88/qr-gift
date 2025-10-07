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

## Usage

1. Start the server:
```bash
npm start
```

2. For development with auto-reload:
```bash
npm run dev
```

3. Open your browser and navigate to:
   - Main page: `http://localhost:3000`
   - Admin panel: `http://localhost:3000/admin`

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
├── server.js           # Express server
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
