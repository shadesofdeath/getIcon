// logoService.js
class LogoService {
    async getLogo(domain) {
        try {
            // Domain temizleme
            domain = this.cleanDomain(domain);

            // En güvenilir servisleri sırayla deneyelim
            const services = [
                {
                    name: 'Clearbit',
                    url: `https://logo.clearbit.com/${domain}?size=512`,
                    quality: 'HD'
                },
                {
                    name: 'Brandfetch',
                    url: `https://api.brandfetch.io/v2/brands/${domain}`,
                    quality: 'HD'
                },
                {
                    name: 'Google',
                    url: `https://www.google.com/s2/favicons?sz=256&domain=${domain}`,
                    quality: 'High'
                }
            ];

            // İlk çalışan servisi döndür
            for (const service of services) {
                if (await this.isImageAvailable(service.url)) {
                    return {
                        status: 200,
                        message: "Success! Logo found.",
                        data: {
                            url: service.url,
                            provider: service.name,
                            quality: service.quality,
                            domain: domain,
                            timestamp: new Date().toISOString()
                        }
                    };
                }
            }

            throw new Error("No logo found");

        } catch (error) {
            return {
                status: 404,
                message: "Logo not found",
                error: error.message,
                domain: domain,
                timestamp: new Date().toISOString()
            };
        }
    }

    async isImageAvailable(url) {
        try {
            const img = new Image();
            img.src = url;
            
            return new Promise((resolve) => {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
            });
        } catch {
            return false;
        }
    }

    cleanDomain(domain) {
        return domain
            .toLowerCase()
            .replace(/^(https?:\/\/)?(www\.)?/i, '')
            .replace(/\/$/, '')
            .trim();
    }
}

// API endpoint
const params = new URLSearchParams(window.location.search);
const domain = params.get('domain');

if (domain) {
    const service = new LogoService();
    service.getLogo(domain).then(result => {
        // Pretty JSON output
        document.body.innerHTML = `
            <pre style="
                background: #f6f8fa;
                padding: 20px;
                border-radius: 8px;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.5;
                overflow: auto;
                max-width: 800px;
                margin: 20px auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">${JSON.stringify(result, null, 2)}</pre>
        `;
    });
} else {
    document.body.innerHTML = `
        <pre style="
            background: #f6f8fa;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            overflow: auto;
            max-width: 800px;
            margin: 20px auto;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        ">${JSON.stringify({
            status: 400,
            message: "Domain parameter is required",
            timestamp: new Date().toISOString()
        }, null, 2)}</pre>
    `;
}