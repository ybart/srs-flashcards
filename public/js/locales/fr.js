// French, keyed by the English text. A key with no entry falls back to its own
// key, so an untranslated string shows in English rather than showing a name.
//
// %{...} are filled in by t(); the singular and plural forms of a counted string
// are two separate keys, chosen by tn().

export const FR = {
  // Loading and chrome
  'Preparing…': 'Préparation…',
  'Offline': 'Hors ligne',
  '« Categories': '« Catégories',
  'Progress': 'Progression',
  'Related': 'Cartes liées',

  // Settings menu
  'Export Database': 'Exporter la base',
  'Import Database': 'Importer une base',
  'Reset Database': 'Réinitialiser la base',
  'Check for Updates': 'Rechercher des mises à jour',
  'Install App': 'Installer l’application',
  'Credits': 'Crédits',
  '☕ Support Us': '☕ Nous soutenir',

  // Demo ribbon
  'Demo': 'Démo',
  'Install to save progress': 'Installez pour garder votre progression',
  'Demo mode: progress is not saved. Install the app to save it.':
    'Mode démo : la progression n’est pas enregistrée. Installez l’application pour la conserver.',

  // Category list
  'cards': 'cartes',
  'Never studied': 'Jamais étudiée',
  'Reminder': 'Rappel',
  'Remind me to study': 'Me rappeler de réviser',
  'next %{when}': 'prochaine %{when}',

  // Reminders
  'Remind me': 'Me le rappeler',
  'How often should it repeat?': 'À quelle fréquence ?',
  'Every day': 'Chaque jour',
  'Every week': 'Chaque semaine',
  'Every month': 'Chaque mois',
  'Study %{category}': 'Réviser %{category}',
  'A deck is ready to review in %{category}.':
    'Un paquet est prêt à être révisé dans %{category}.',
  'Study your flashcards': 'Réviser vos cartes',
  'Open SRS Flashcards and review what is due.':
    'Ouvrez SRS Flashcards et révisez ce qui est dû.',
  'Open SRS Flashcards from your home screen.':
    'Ouvrez SRS Flashcards depuis votre écran d’accueil.',

  // Study
  'The deck is now empty': 'Le paquet est vide',
  'Next card %{when}': 'Prochaine carte %{when}',

  // Progress
  'No study history yet': 'Aucun historique pour l’instant',
  // Not "jamais étudiée": the adjective would have to agree with the deck, which
  // is "1 carte" or "412 cartes" depending. This says as much and never inflects.
  '%{deck}, not started': '%{deck}, aucune révision',
  'usually %{amount} a day': 'd’habitude %{amount} par jour',
  '%{count} study days': '%{count} jours étudiés',
  'day %{number}': 'jour %{number}',
  'Reviews': 'Révisions',
  'Cards': 'Cartes',
  'Time': 'Temps',
  'All': 'Tout',
  '1 year': '1 an',
  '3 months': '3 mois',
  '1 month': '1 mois',
  '90 days': '90 jours',
  '30 days': '30 jours',
  '7 days': '7 jours',
  'Study days': 'Jours étudiés',
  'Save image': 'Enregistrer l’image',
  '%{count} card': '%{count} carte',
  '%{count} cards': '%{count} cartes',
  '%{count} review': '%{count} révision',
  '%{count} reviews': '%{count} révisions',

  // Database and updates
  'Importing will REPLACE your current data with this file. Continue?':
    'L’import REMPLACERA vos données actuelles par ce fichier. Continuer ?',
  'Import failed: %{error}': 'Import échoué : %{error}',
  'Is this a valid SRS Flashcards database file?':
    'Ce fichier est-il bien une base SRS Flashcards ?',
  'Database deleted': 'Base supprimée',
  'Updates are unavailable here.': 'Les mises à jour ne sont pas disponibles ici.',
  'A new version is available. Install now?':
    'Une nouvelle version est disponible. L’installer maintenant ?',
  'You\'re up to date (%{version})': 'Vous êtes à jour (%{version})',
  'Update check failed: %{error}': 'Échec de la vérification : %{error}',
  'Update check failed. Please try again later.':
    'Échec de la vérification. Merci de réessayer plus tard.',

  // Donation
  'Enjoying SRS Flashcards?': 'SRS Flashcards vous plaît ?',
  '☕ Support development': '☕ Soutenir le développement',
  'Buy me a coffee': 'M’offrir un café',
  'I already donated': 'J’ai déjà donné',
  'Close': 'Fermer',

  // Credits
  'Card meanings': 'Sens des cartes',
  'English meanings and readings come from StudyKanji.':
    'Les sens et lectures en anglais proviennent de StudyKanji.',
  'French meanings come from the Electronic Dictionary Research and Development Group (KANJIDIC2 and JMdict), used under CC BY-SA 4.0. Meanings those files did not cover were translated for this app.':
    'Les sens en français proviennent de l’Electronic Dictionary Research and Development Group (KANJIDIC2 et JMdict), utilisés sous licence CC BY-SA 4.0. Les sens absents de ces fichiers ont été traduits pour cette application.'
}
