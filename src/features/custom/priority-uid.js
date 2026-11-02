import { toast } from 'kernelsu';
import { run, escapeHtml } from '../../utils.js';
import { config, susfs_bin } from '../../core/constants.js';

let configuredPackages = [];
let allPackages = [];
let tempSelectedPackages = new Set();

export async function loadPriorityFilterConfig() {
	try {
		const content = await run(`[ -f ${config}/priority_uid_filter.txt ] && cat ${config}/priority_uid_filter.txt || echo ""`);
		configuredPackages = content
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0 && !line.startsWith('#'));
	} catch (error) {
		console.error("Failed to load priority_uid_filter.txt:", error);
		configuredPackages = [];
	}
	return configuredPackages;
}

export async function savePriorityFilterConfig(pkgs) {
	try {
		configuredPackages = Array.from(new Set(pkgs.filter(p => p && p.trim().length > 0)));
		const content = configuredPackages.join('\n');
		await run(`cat <<'EOF' > ${config}/priority_uid_filter.txt\n# Priority UID Filter\n${content}\nEOF`);

		// Hot reload to kernel if susfs_bin is available
		const pkgsArg = configuredPackages.join(',');
		if (pkgsArg) {
			await run(`${susfs_bin} set_priority_uid_filter "${pkgsArg}"`).catch(() => {});
		}

		// Sync custom_feature_textarea if PRIORITY_UID_FILTER is currently selected
		const select = document.getElementById("custom_feature_select");
		const textarea = document.getElementById("custom_feature_textarea");
		if (select && select.value === "PRIORITY_UID_FILTER" && textarea) {
			textarea.value = `# Priority UID Filter\n${content}`;
		}

		return true;
	} catch (error) {
		console.error("Failed to save priority_uid_filter.txt:", error);
		return false;
	}
}

export function renderPriorityPackageList() {
	const listEl = document.getElementById("priority_pkg_entries_list");
	const countEl = document.getElementById("priority_pkg_count");
	if (!listEl) return;

	if (countEl) {
		countEl.textContent = `${configuredPackages.length} package${configuredPackages.length === 1 ? '' : 's'} configured`;
	}

	if (configuredPackages.length === 0) {
		listEl.innerHTML = `
			<p class="text-white/60 text-base font-amongus2 text-center py-3" data-i18n="no_packages_configured_label">
				${window.i18n ? window.i18n.getTranslation("no_packages_configured_label") : "No packages configured. Click 'Select Packages' to add."}
			</p>
		`;
		return;
	}

	listEl.innerHTML = configuredPackages.map((pkg) => `
		<div class="flex justify-between items-center p-3 bg-cyan-100/10 border border-cyan-200/30 rounded">
			<div class="flex-grow min-w-0 overflow-hidden pr-2">
				<p class="text-white font-bold text-sm truncate min-w-0 w-full overflow-hidden">${escapeHtml(pkg)}</p>
				<p class="text-cyan-300 text-base font-amongus2 font-bold tracking-wider uppercase">Priority UID Filter</p>
			</div>
			<div class="flex gap-2 flex-shrink-0">
				<button class="btn btn-ghost btn-sm p-2 text-white hover:bg-red-500/30" onclick="window.removePriorityPkg('${escapeHtml(pkg)}')">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3H4v2h16V7h-3z"></path>
					</svg>
				</button>
			</div>
		</div>
	`).join('');
}

window.removePriorityPkg = async (pkg) => {
	const nextPkgs = configuredPackages.filter(p => p !== pkg);
	const success = await savePriorityFilterConfig(nextPkgs);
	if (success) {
		renderPriorityPackageList();
		toast(`Removed ${pkg}`);
	}
};

export async function openPriorityPackageModal() {
	const modal = document.getElementById("priority_pkgs_modal");
	if (!modal) return;

	tempSelectedPackages = new Set(configuredPackages);
	updateModalSelectedCount();

	const searchInput = document.getElementById("priority_pkg_search_input");
	if (searchInput) searchInput.value = "";

	modal.showModal();
	await loadSystemPackages(false);
}
window.openPriorityPackageModal = openPriorityPackageModal;

async function loadSystemPackages(includeSystem) {
	const listContainer = document.getElementById("priority_modal_pkg_list");
	if (listContainer) {
		listContainer.innerHTML = `<p class="text-cyan-300 text-sm font-amongus2 text-center py-4 uppercase tracking-wider">Loading installed packages...</p>`;
	}

	try {
		const cmd = includeSystem ? "pm list packages | cut -d: -f2" : "pm list packages -3 | cut -d: -f2";
		const stdout = await run(cmd);
		const pkgs = stdout
			.split('\n')
			.map(p => p.trim())
			.filter(p => p.length > 0);

		const set = new Set([...configuredPackages, ...pkgs]);
		allPackages = Array.from(set).sort((a, b) => {
			const aSelected = tempSelectedPackages.has(a);
			const bSelected = tempSelectedPackages.has(b);
			if (aSelected && !bSelected) return -1;
			if (!aSelected && bSelected) return 1;
			return a.localeCompare(b);
		});
	} catch (error) {
		console.error("Failed to load packages via pm:", error);
		allPackages = Array.from(new Set(configuredPackages));
	}

	renderModalPackageList(document.getElementById("priority_pkg_search_input")?.value || "");
}

function updateModalSelectedCount() {
	const countEl = document.getElementById("priority_modal_selected_count");
	if (countEl) {
		countEl.textContent = `${tempSelectedPackages.size} selected`;
	}
}

function renderModalPackageList(filterText) {
	const listContainer = document.getElementById("priority_modal_pkg_list");
	if (!listContainer) return;

	const filter = (filterText || "").trim().toLowerCase();
	const displayed = allPackages.filter(pkg => !filter || pkg.toLowerCase().includes(filter));

	if (displayed.length === 0) {
		listContainer.innerHTML = `<p class="text-white/60 text-sm font-amongus2 text-center py-4 uppercase">No packages match the search criteria.</p>`;
		return;
	}

	listContainer.innerHTML = displayed.map(pkg => {
		const isChecked = tempSelectedPackages.has(pkg);
		return `
			<label class="flex justify-between items-center p-2.5 bg-cyan-100/10 border border-cyan-200/30 rounded cursor-pointer hover:bg-cyan-100/20 transition-colors">
				<div class="flex items-center gap-3 min-w-0 overflow-hidden flex-1">
					<input type="checkbox" class="checkbox checkbox-sm checkbox-primary border-white" data-pkg="${escapeHtml(pkg)}" ${isChecked ? 'checked' : ''} />
					<span class="text-white text-sm font-bold truncate">${escapeHtml(pkg)}</span>
				</div>
			</label>
		`;
	}).join('');

	listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
		cb.addEventListener('change', (e) => {
			const pkg = e.target.getAttribute('data-pkg');
			if (e.target.checked) {
				tempSelectedPackages.add(pkg);
			} else {
				tempSelectedPackages.delete(pkg);
			}
			updateModalSelectedCount();
		});
	});
}

export async function init_priority_uid_filter(susfs_features) {
	const section = document.getElementById("custom_priority_uid_filter_section");
	if (!section) return;

	if (!susfs_features.includes("CONFIG_KSU_SUSFS_PRIORITY_UID_FILTER")) {
		section.classList.add("hidden");
		return;
	}
	section.classList.remove("hidden");

	await loadPriorityFilterConfig();
	renderPriorityPackageList();

	const manageBtn = document.getElementById("manage_priority_pkgs_btn");
	if (manageBtn) {
		manageBtn.onclick = () => openPriorityPackageModal();
	}

	const modal = document.getElementById("priority_pkgs_modal");
	if (!modal) return;

	const searchInput = document.getElementById("priority_pkg_search_input");
	if (searchInput) {
		searchInput.oninput = (e) => renderModalPackageList(e.target.value);
	}

	const showSystemCheckbox = document.getElementById("priority_pkg_show_system");
	if (showSystemCheckbox) {
		showSystemCheckbox.onchange = (e) => loadSystemPackages(e.target.checked);
	}

	const selectAllBtn = document.getElementById("priority_pkg_select_all");
	if (selectAllBtn) {
		selectAllBtn.onclick = () => {
			const filter = (searchInput?.value || "").trim().toLowerCase();
			allPackages.filter(p => !filter || p.toLowerCase().includes(filter)).forEach(p => tempSelectedPackages.add(p));
			updateModalSelectedCount();
			renderModalPackageList(searchInput?.value || "");
		};
	}

	const deselectAllBtn = document.getElementById("priority_pkg_deselect_all");
	if (deselectAllBtn) {
		deselectAllBtn.onclick = () => {
			const filter = (searchInput?.value || "").trim().toLowerCase();
			allPackages.filter(p => !filter || p.toLowerCase().includes(filter)).forEach(p => tempSelectedPackages.delete(p));
			updateModalSelectedCount();
			renderModalPackageList(searchInput?.value || "");
		};
	}

	const addCustomBtn = document.getElementById("priority_add_custom_pkg_btn");
	const customInput = document.getElementById("priority_custom_pkg_input");
	if (addCustomBtn && customInput) {
		const addAction = () => {
			const val = customInput.value.trim();
			if (val) {
				tempSelectedPackages.add(val);
				if (!allPackages.includes(val)) {
					allPackages.unshift(val);
				}
				customInput.value = "";
				updateModalSelectedCount();
				renderModalPackageList(searchInput?.value || "");
			}
		};
		addCustomBtn.onclick = addAction;
		customInput.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addAction();
			}
		};
	}

	const saveBtn = document.getElementById("priority_modal_save_btn");
	if (saveBtn) {
		saveBtn.onclick = async () => {
			const success = await savePriorityFilterConfig(Array.from(tempSelectedPackages));
			if (success) {
				renderPriorityPackageList();
				toast("Priority UID Filter saved!");
				modal.close();
			} else {
				toast("Failed to save Priority UID Filter");
			}
		};
	}
}
