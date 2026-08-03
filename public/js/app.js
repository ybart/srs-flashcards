import * as Turbo from 'https://cdn.jsdelivr.net/npm/@hotwired/turbo@8.0.12/dist/turbo.es2017-esm.js';
import { Application, Controller } from 'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm'

import CategoriesController from './controllers/categories_controller.js'
import StudySessionController from './controllers/study_session_controller.js'
import DonateController from './controllers/donate_controller.js'
import ProgressController from './controllers/progress_controller.js'
import I18nController from './controllers/i18n_controller.js'

window.Stimulus = Application.start()

Stimulus.register("categories", CategoriesController);
Stimulus.register("study-session", StudySessionController);
Stimulus.register("donate", DonateController);
Stimulus.register("progress", ProgressController);
Stimulus.register("i18n", I18nController);

