import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Building, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import API from '../config/api.config';
import {
    fetchUserMonoAccount,
    linkMonoAccountFromCode,
    openMonoConnectWidget,
} from '../utils/monoConnect';

const authHeaders = () => {
    const token = localStorage.getItem('access_token');
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

const secretHeaders = (token) => ({
    ...authHeaders(),
    'X-Mono-Repay-Test-Secret': token,
});

const MonoRepayTest = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const testToken = searchParams.get('token') || '';

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState(null);
    const [monoAccount, setMonoAccount] = useState({ linked: false });

    const loadConfig = useCallback(async () => {
        const res = await axios.get(API.BNPL_MONO_REPAY_TEST_CONFIG, { headers: authHeaders() });
        return res.data?.data;
    }, []);

    const loadMonoAccount = useCallback(async () => {
        const data = await fetchUserMonoAccount();
        setMonoAccount(data);
        return data;
    }, []);

    const loadStatus = useCallback(async () => {
        if (!testToken) return null;
        try {
            const res = await axios.get(API.BNPL_MONO_REPAY_TEST_STATUS, {
                headers: secretHeaders(testToken),
                params: { token: testToken },
            });
            const data = res.data?.data;
            setStatus(data);
            return data;
        } catch (err) {
            if (err?.response?.status === 404) {
                setStatus(null);
                return null;
            }
            throw err;
        }
    }, [testToken]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const token = localStorage.getItem('access_token');
                if (!token) {
                    navigate('/login?returnTo=/bnpl/mono-repay-test');
                    return;
                }
                if (!testToken) {
                    setError('Add ?token=YOUR_TEST_SECRET to the URL (from server BNPL_MONO_REPAY_TEST_SECRET).');
                    return;
                }
                const [cfg] = await Promise.all([loadConfig(), loadMonoAccount()]);
                if (!cancelled) {
                    setConfig(cfg);
                    await loadStatus();
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.message || err.message || 'Cannot access Mono repayment test.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [testToken, loadConfig, loadMonoAccount, loadStatus, navigate]);

    const getLocalUser = () => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch {
            return null;
        }
    };

    const handleLinkBank = async ({ browseOnly = false } = {}) => {
        setBusy(browseOnly ? 'browse' : 'link');
        setError('');
        try {
            const user = getLocalUser();
            const customerName = [user?.first_name, user?.surname || user?.last_name].filter(Boolean).join(' ')
                || user?.name
                || user?.full_name
                || 'Customer';
            const customerEmail = user?.email || '';
            if (!customerEmail) {
                setError('Your account email is missing. Log out and log in again, then retry.');
                return;
            }
            await openMonoConnectWidget({
                customerName,
                customerEmail,
                referencePrefix: browseOnly ? 'troosolar_repay_browse' : 'troosolar_repay_test',
                prepareCamera: false,
                onClose: () => setBusy(''),
                onSuccess: async (payload) => {
                    if (browseOnly) {
                        return;
                    }
                    const code = payload?.code;
                    if (!code) {
                        setError('Mono did not return an authorization code.');
                        return;
                    }
                    await linkMonoAccountFromCode(code);
                    await loadMonoAccount();
                },
            });
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to open Mono Connect.');
        } finally {
            setBusy('');
        }
    };

    const handleBootstrap = async (forceRegenerate = false) => {
        setBusy('bootstrap');
        setError('');
        try {
            const res = await axios.post(
                API.BNPL_MONO_REPAY_TEST_BOOTSTRAP,
                { force_regenerate: forceRegenerate, test_secret: testToken },
                { headers: secretHeaders(testToken) }
            );
            setStatus(res.data?.data);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Bootstrap failed.');
        } finally {
            setBusy('');
        }
    };

    const handleRefreshDueDates = async () => {
        setBusy('refresh');
        setError('');
        try {
            const res = await axios.post(
                API.BNPL_MONO_REPAY_TEST_REFRESH_DUE,
                { test_secret: testToken },
                { headers: secretHeaders(testToken) }
            );
            setStatus(res.data?.data?.bootstrap || res.data?.data);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Could not refresh due dates.');
        } finally {
            setBusy('');
        }
    };

    const handleSetupMandate = async () => {
        if (!status?.mono_calculation_id) {
            setError('Create the test loan first.');
            return;
        }
        setBusy('mandate');
        setError('');
        try {
            const res = await axios.post(
                API.BNPL_MANDATE_INITIATE,
                {
                    mono_calculation_id: status.mono_calculation_id,
                    loan_application_id: status.application_id,
                },
                { headers: authHeaders() }
            );
            const authUrl = res.data?.data?.authorization_url;
            if (authUrl) {
                window.open(authUrl, '_blank', 'noopener,noreferrer');
            }
            alert(
                'Complete the Mono e-mandate in the new window (₦50 verification). ' +
                'After bank approval, return here and refresh status.'
            );
            const mandateRes = await axios.get(
                API.BNPL_MANDATE_STATUS(status.mono_calculation_id),
                { headers: authHeaders() }
            );
            setStatus((prev) => ({
                ...prev,
                mandate: mandateRes.data?.data,
            }));
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Mandate setup failed.');
        } finally {
            setBusy('');
        }
    };

    const handleRefreshStatus = async () => {
        setBusy('status');
        setError('');
        try {
            await loadStatus();
            if (status?.mono_calculation_id) {
                const mandateRes = await axios.get(
                    API.BNPL_MANDATE_STATUS(status.mono_calculation_id),
                    { headers: authHeaders() }
                );
                setStatus((prev) => (prev ? { ...prev, mandate: mandateRes.data?.data } : prev));
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Could not refresh status.');
        } finally {
            setBusy('');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader className="animate-spin text-[#273e8e]" size={40} />
            </div>
        );
    }

    const mandateReady = status?.mandate?.ready_to_debit;
    const mandatePending = status?.mandate?.has_mandate && !mandateReady;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <button
                        type="button"
                        onClick={() => navigate('/more')}
                        className="flex items-center text-gray-600 hover:text-[#273e8e]"
                    >
                        <ArrowLeft size={18} className="mr-1" /> Back
                    </button>
                    <span className="font-semibold text-[#273e8e]">Mono Repay Test</span>
                </div>
            </div>

            <div className="max-w-2xl mx-auto p-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                    <strong>Production test lane only.</strong> Does not change normal BNPL limits or flow.
                    Uses real Mono keys — mandate and debits are real money.
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">
                        {error}
                    </div>
                )}

                {config && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
                        <h2 className="font-semibold text-gray-900">Test configuration</h2>
                        <p>Installments: {config.installment_count} × ₦{Number(config.installment_amount).toLocaleString()}</p>
                        <p>Down payment (test): ₦{Number(config.down_payment).toLocaleString()}</p>
                        <p>First due: {config.due_today ? 'today' : 'next month'}</p>
                        <p className="flex items-center gap-2">
                            <Building size={16} />
                            Bank: {monoAccount?.linked
                                ? (monoAccount.bank_label || 'Linked')
                                : 'Not linked'}
                        </p>
                    </div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h2 className="font-semibold text-gray-900">Step 1 — Link bank</h2>
                    {monoAccount?.linked && (
                        <p className="text-green-700 flex items-center gap-2 text-sm">
                            <CheckCircle size={18} /> Bank linked
                            {monoAccount.bank_label ? ` — ${monoAccount.bank_label}` : ''}
                        </p>
                    )}
                    <p className="text-xs text-gray-500">
                        Browse mode opens Mono without a camera check. Complete the flow only if you want to save a new bank.
                    </p>
                    <button
                        type="button"
                        disabled={busy === 'browse' || busy === 'link'}
                        onClick={() => handleLinkBank({ browseOnly: true })}
                        className="w-full py-3 bg-[#273e8e] text-white rounded-lg font-semibold disabled:opacity-50"
                    >
                        {busy === 'browse' ? 'Opening Mono…' : 'Browse bank options'}
                    </button>
                    <button
                        type="button"
                        disabled={busy === 'browse' || busy === 'link'}
                        onClick={() => handleLinkBank({ browseOnly: false })}
                        className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                        {busy === 'link'
                            ? 'Opening Mono…'
                            : (monoAccount?.linked ? 'Change linked bank' : 'Link bank with Mono')}
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h2 className="font-semibold text-gray-900">Step 2 — Create test loan</h2>
                    <p className="text-sm text-gray-600">
                        Bypasses BNPL minimums. Creates an approved test order with small installments.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            disabled={!monoAccount?.linked || busy === 'bootstrap'}
                            onClick={() => handleBootstrap(false)}
                            className="w-full py-3 bg-[#273e8e] text-white rounded-lg font-semibold disabled:opacity-50"
                        >
                            {busy === 'bootstrap' ? 'Creating…' : (status ? 'Refresh test loan' : 'Create test loan')}
                        </button>
                        {status && (
                            <button
                                type="button"
                                disabled={busy === 'bootstrap'}
                                onClick={() => handleBootstrap(true)}
                                className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium"
                            >
                                Start fresh test loan
                            </button>
                        )}
                    </div>
                    {status && (
                        <div className="text-sm text-gray-700 space-y-1 pt-2 border-t">
                            <p>Order: {status.order_number || status.order_id}</p>
                            <p>Mono calc ID: {status.mono_calculation_id}</p>
                            <ul className="list-disc pl-5">
                                {(status.installments || []).map((row) => (
                                    <li key={row.id}>
                                        #{row.id} — ₦{Number(row.amount).toLocaleString()} — due {row.payment_date} — {row.status}
                                    </li>
                                ))}
                            </ul>
                            {status.loan_page_path && (
                                <Link to={status.loan_page_path} className="text-[#273e8e] underline font-medium">
                                    Open full loan page
                                </Link>
                            )}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h2 className="font-semibold text-gray-900">Step 3 — Repayment mandate</h2>
                    {mandateReady ? (
                        <p className="text-green-700 text-sm flex items-center gap-2">
                            <CheckCircle size={18} /> Mandate active — ready to debit
                        </p>
                    ) : mandatePending ? (
                        <p className="text-amber-800 text-sm">
                            Mandate pending: {status.mandate?.status}. Bank approval can take up to 72 hours.
                            {status.mandate?.authorization_url && (
                                <button
                                    type="button"
                                    className="block mt-2 text-[#273e8e] underline"
                                    onClick={() => window.open(status.mandate.authorization_url, '_blank')}
                                >
                                    Open Mono authorization
                                </button>
                            )}
                        </p>
                    ) : (
                        <button
                            type="button"
                            disabled={!status?.mono_calculation_id || busy === 'mandate'}
                            onClick={handleSetupMandate}
                            className="w-full py-3 bg-[#273e8e] text-white rounded-lg font-semibold disabled:opacity-50"
                        >
                            {busy === 'mandate' ? 'Starting…' : 'Set up automatic repayments'}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={busy === 'status'}
                        onClick={handleRefreshStatus}
                        className="flex items-center justify-center gap-2 w-full py-2 text-sm text-[#273e8e] font-medium"
                    >
                        <RefreshCw size={16} /> Refresh mandate status
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h2 className="font-semibold text-gray-900">Step 4 — Auto-debit test</h2>
                    <p className="text-sm text-gray-600">
                        On the server run: <code className="bg-gray-100 px-1 rounded">php artisan bnpl:collect-due-installments</code>
                    </p>
                    <button
                        type="button"
                        disabled={!status || busy === 'refresh'}
                        onClick={handleRefreshDueDates}
                        className="w-full py-2 border border-[#273e8e] text-[#273e8e] rounded-lg font-medium disabled:opacity-50"
                    >
                        {busy === 'refresh' ? 'Updating…' : 'Set all pending installments due today'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MonoRepayTest;
