// ==UserScript==
// @name         VS Code Marketplace VSIX Downloader（修复通用版 + Mac适配）
// @namespace    https://github.com/
// @version      1.6
// @description  版本历史 + 动态架构 + 修复通用版问题，自动适配 Mac
// @author       Grok
// @match        https://marketplace.visualstudio.com/items*
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let currentVersions = [];
    let currentInfo = null;

    // 自动检测用户平台
    function detectUserPlatform() {
        const ua = navigator.userAgent;
        if (ua.includes('Mac')) {
            if (ua.includes('ARM') || ua.includes('Apple Silicon')) return 'darwin-arm64';
            return 'darwin-x64';   // Intel Mac
        }
        if (ua.includes('Win')) return 'win32-x64';
        if (ua.includes('Linux')) return 'linux-x64';
        return '';
    }

    const userPlatform = detectUserPlatform();

    function getExtensionInfo() {
        const url = new URL(window.location.href);
        const itemName = url.searchParams.get('itemName');
        if (!itemName) return null;
        const [publisher, extension] = itemName.split('.');
        return { publisher, extension, itemName };
    }

    function fetchVersions(info, callback) {
        const body = {
            "filters": [{ "criteria": [
                { "filterType": 7, "value": info.itemName },
                { "filterType": 8, "value": "Microsoft.VisualStudio.Code" }
            ]}],
            "flags": 0x3F
        };

        GM_xmlhttpRequest({
            method: "POST",
            url: "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=3.0-preview.1",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(body),
            onload: function(res) {
                try {
                    const data = JSON.parse(res.responseText);
                    currentVersions = data.results[0].extensions[0].versions.sort((a,b) =>
                        new Date(b.lastUpdated) - new Date(a.lastUpdated)
                    );
                    callback(currentVersions);
                } catch(e) {
                    console.error(e);
                    callback([]);
                }
            }
        });
    }

    function getAvailablePlatforms(versionData) {
        const set = new Set([""]); // 通用版
        if (versionData.files) {
            versionData.files.forEach(f => {
                if (f.targetPlatform) set.add(f.targetPlatform);
            });
        }
        return Array.from(set);
    }

    function createPlatformOptions(available) {
        const map = {
            "": "🌐 通用版（推荐）",
            "win32-x64": "🪟 Windows x64",
            "win32-arm64": "🪟 Windows ARM64",
            "linux-x64": "🐧 Linux x64",
            "linux-arm64": "🐧 Linux ARM64",
            "darwin-x64": "🍎 macOS Intel",
            "darwin-arm64": "🍎 macOS Apple Silicon (M1/M2/M3)",
            "web": "🌐 Web"
        };

        return available.map(p => {
            const label = map[p] || p;
            const selected = (p === userPlatform) ? 'selected' : '';
            return `<option value="${p}" ${selected}>${label}</option>`;
        }).join('');
    }

    function createDownloadUI() {
        const container = document.createElement('div');
        container.id = 'grok-vsix-downloader';
        container.style.cssText = `margin:15px 0; padding:15px; border:1px solid #ddd; border-radius:8px; background:#f9f9f9;`;

        container.innerHTML = `
            <div style="margin-bottom:8px;font-weight:bold;">📋 选择版本:</div>
            <select id="version-select" style="width:100%;padding:8px;margin-bottom:12px;border-radius:4px;"></select>

            <div style="margin-bottom:8px;font-weight:bold;">💻 选择架构:</div>
            <select id="platform-select" style="width:100%;padding:8px;margin-bottom:12px;border-radius:4px;"></select>

            <button id="download-btn" style="width:100%;padding:12px;background:#0e8a16;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">
                📥 下载
            </button>
        `;

        return container;
    }

    function init() {
        if (!document.querySelector('.ux-item-name')) return;

        const checkExist = setInterval(() => {
            const target = document.querySelector('.installButtonContainer, .buttons-container, .action-bar');
            if (target && !document.getElementById('grok-vsix-downloader')) {
                clearInterval(checkExist);

                currentInfo = getExtensionInfo();
                if (!currentInfo) return;

                const ui = createDownloadUI();
                target.parentNode.insertBefore(ui, target.nextSibling);

                const versionSelect = document.getElementById('version-select');
                const platformSelect = document.getElementById('platform-select');
                const downloadBtn = document.getElementById('download-btn');

                fetchVersions(currentInfo, (versions) => {
                    versionSelect.innerHTML = '';
                    versions.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v.version;
                        opt.textContent = `${v.version} (${new Date(v.lastUpdated).toLocaleDateString()})`;
                        versionSelect.appendChild(opt);
                    });

                    if (versions[0]) {
                        updatePlatforms(versions[0]);
                    }
                });

                versionSelect.onchange = () => {
                    const ver = currentVersions.find(v => v.version === versionSelect.value);
                    if (ver) updatePlatforms(ver);
                };

                function updatePlatforms(verData) {
                    const avail = getAvailablePlatforms(verData);
                    platformSelect.innerHTML = createPlatformOptions(avail);
                }

                downloadBtn.onclick = () => {
                    const version = versionSelect.value;
                    let platform = platformSelect.value;

                    let url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${currentInfo.publisher}/vsextensions/${currentInfo.extension}/${version}/vspackage`;
                    if (platform) url += `?targetPlatform=${platform}`;

                    const filename = `${currentInfo.itemName}-${version}${platform ? '-' + platform : ''}.vsix`;

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();

                    downloadBtn.textContent = '✅ 下载中...';
                    setTimeout(() => downloadBtn.textContent = '📥 下载', 2500);
                };
            }
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    new MutationObserver(() => setTimeout(init, 1500)).observe(document.body, { childList: true, subtree: true });
})();