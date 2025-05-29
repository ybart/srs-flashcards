# SRS Flashcards

## Table of Contents
- [Why SRS Flashcards?](#why-srs-flashcards)
- [Key Features](#key-features)
  - [Core Learning System](#core-learning-system)
  - [Study Tools](#study-tools)
  - [Progress Tracking](#progress-tracking)
  - [Cross-Platform Availability](#cross-platform-availability)
- [Data Structure](#data-structure)
- [Getting Started](#getting-started)
- [Documentation](#documentation)

## Why SRS Flashcards?

Master Japanese vocabulary and kanji efficiently with this Spaced Repetition System (SRS) application that:

- 📈 **Optimizes your learning** using a scientifically-proven algorithm
- 🗂 **Organizes content** by JLPT levels (N5 to N1) and school grades
- 📱 **Works anywhere** with PWA support for mobile and offline use
- 🔄 **Syncs your progress** between devices via local file or Google Drive
- 🎯 **Tracks your mastery** with detailed progress statistics

## Key Features

### Core Learning System
- Smart SRS algorithm that adapts to your memory
- Vocabulary and kanji organized by JLPT levels
- Visual progress indicators for each study category

### Study Tools
- Clean, distraction-free study interface
- Related cards linking for contextual learning
- Customizable study sessions

### Progress Tracking
- Daily progress statistics and goals
- Long-term retention metrics
- Study history and performance trends

### Cross-Platform Availability
- Install as a PWA on any device
- Offline-capable with automatic sync when online
- Responsive design for all screen sizes

## Getting Started

To set up and run the SRS Flashcards project locally:

1. **Prerequisites**:
   - Ruby (version specified in .ruby-version)
   - Node.js (for PWA asset generation)
   - SQLite3 (for database)

2. **Setup**:
   ```bash
   bin/setup  # Installs dependencies and sets up the database
   ```

3. **Running the application**:
   - For development with live reload:
     ```bash
     bin/server
     ```
     Then open `https://localhost:8000` in your browser (accept the self-signed certificate)
   

For more detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

For the current TODO list, see [docs/TODO.md](docs/TODO.md).

For details on the SRS Algorithm, see [docs/SRS_ALGORITHM.md](docs/SRS_ALGORITHM.md).


## Data Structure

For detailed database schema documentation, see [docs/SCHEMA.md](docs/SCHEMA.md).

Key components:
- **Cards**: Vocabulary/Kanji items with SRS tracking
- **Categories**: Organized study groups (e.g., JLPT levels)
- **Sessions**: Practice periods with performance metrics
