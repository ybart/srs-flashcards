# SRS Algorithm

1. Cards are initially gray when not reviewed. All gray cards are available
   for studying.
2. When starting a new session, put 10 available cards in study
   (those from last session first, then preferably green are chosen first,
   then lime ones, ...).
3. If correct, the card get an orange label, else it gets a red one
   and an available card replaces this one for studying.
4. After 5 minutes, orange cards becomes available to be inserted.
   If correct, it is labelled yellow, else become red (unless preferences
   is set to become closer to red instead)
5. After 3 days, yellow cards becomes available to the session.
6. After 9 days, lime cards becomes available to the session.
7. After 20 days, green cards becomes available to the session.
8. When no card are available, show finish screen (and add a button
   to allow inserting cards of wrong color)

# Studying

For statistics, after each study action, the number of cards of
each color should be stored in progress column. The data from the last
session of each day will be displayed in statistics board. 