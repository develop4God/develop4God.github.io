# Google Analytics Setup Instructions

## Overview
This repository has been configured with Google Analytics 4 (GA4) tracking code on all HTML pages with the Measurement ID: **G-KBGE96RQML**

## ✅ Configuration Complete

The Google Analytics tag has been successfully installed on all pages with the real Measurement ID **G-KBGE96RQML**.

### Pages with Google Analytics installed:

- ✅ `/index.html`
- ✅ `/devocionales/index.html`
- ✅ `/devocionales/admin.html`
- ✅ `/devocionales/politica-de-privacidad.html`
- ✅ `/devocionales/terminos-y-condiciones.html`
- ✅ `/habitus/index.html`

## Verification Steps
1. Deploy the changes to your website
2. Visit your website
3. Open Google Analytics
4. Go to Reports > Realtime
5. You should see your visit appear in real-time

## Google Analytics Code Structure

The following code has been added to the `<head>` section of all HTML pages, immediately after the opening `<head>` tag:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-KBGE96RQML"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-KBGE96RQML');
</script>
```

## Privacy Considerations

Make sure to:
1. Update your Privacy Policy to mention Google Analytics usage
2. Comply with GDPR/CCPA if applicable to your audience
3. Consider implementing cookie consent if required by your jurisdiction

## Troubleshooting

### Analytics not showing data
- Verify the Measurement ID is correct
- Check browser console for errors
- Ensure ad blockers are disabled when testing
- Wait 24-48 hours for initial data to populate reports

### Testing in development
- Real-time reports show data immediately
- Use browser developer tools Network tab to verify gtag.js is loading
- Check for the `gtag/js` request in the Network tab

## Additional Resources
- [Google Analytics 4 Documentation](https://support.google.com/analytics/answer/9304153)
- [GA4 Setup Guide](https://support.google.com/analytics/answer/9304153)
