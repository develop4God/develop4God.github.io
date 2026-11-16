(function (global) {
    'use strict';

    // History-based routing for the single Bible-studies page: the list and a study share one
    // URL, `?id=<study>` selects the study. Opening pushes an entry so Back (browser, Android,
    // installed app) closes the study instead of leaving the page (mirrors the app's canPop);
    // deep links still open a study directly.
    function createRouter({ win, nav, onList, onDetail }) {
        const { location, history } = win;

        function route() {
            const { studyId } = nav.parseRoute(location.search);
            if (studyId) onDetail(studyId); else onList();
        }

        function start() {
            win.addEventListener('popstate', route);
            route();
        }

        function open(studyId) {
            history.pushState({ studyOpen: true }, '', nav.buildStudyUrl(location.pathname, location.search, studyId));
            route();
        }

        function close() {
            if (history.state && history.state.studyOpen) {
                history.back(); // popstate shows the list
                return;
            }
            history.replaceState(null, '', nav.buildStudyUrl(location.pathname, location.search, null));
            route();
        }

        const current = () => nav.parseRoute(location.search).studyId;

        return { start, open, close, refresh: route, current };
    }

    global.DiscoveryRouter = { createRouter };
})(window);
