import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function AdminSettings() {
    const [siteName, setSiteName] = useState('Vizzy Pilot');
    const [maxUploadSize, setMaxUploadSize] = useState('50');
    const [enableRegistration, setEnableRegistration] = useState(true);
    const [maintenanceMode, setMaintenanceMode] = useState(false);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-navy">Settings</h2>
                <p className="text-gray-600 text-sm">Platform configuration and preferences</p>
            </div>

            {/* General Settings */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-navy mb-4">General Settings</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                        <input
                            type="text"
                            value={siteName}
                            onChange={(e) => setSiteName(e.target.value)}
                            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-admin-blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Upload Size (MB)</label>
                        <input
                            type="number"
                            value={maxUploadSize}
                            onChange={(e) => setMaxUploadSize(e.target.value)}
                            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-admin-blue"
                        />
                    </div>
                </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-navy mb-4">Security Settings</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between max-w-md">
                        <div>
                            <p className="font-medium text-navy">Enable User Registration</p>
                            <p className="text-sm text-gray-500">Allow new users to register</p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setEnableRegistration(!enableRegistration)}
                            className={`relative w-12 h-6 rounded-full transition ${enableRegistration ? 'bg-admin-blue' : 'bg-gray-300'}`}
                            variant="ghost"
                            size="icon"
                        >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${enableRegistration ? 'left-6' : 'left-0.5'}`}></span>
                        </Button>
                    </div>
                    <div className="flex items-center justify-between max-w-md">
                        <div>
                            <p className="font-medium text-navy">Maintenance Mode</p>
                            <p className="text-sm text-gray-500">Disable access for non-admins</p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setMaintenanceMode(!maintenanceMode)}
                            className={`relative w-12 h-6 rounded-full transition ${maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`}
                            variant="ghost"
                            size="icon"
                        >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${maintenanceMode ? 'left-6' : 'left-0.5'}`}></span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-red-200">
                <h3 className="text-lg font-bold text-red-600 mb-4">Danger Zone</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between max-w-md">
                        <div>
                            <p className="font-medium text-navy">Clear All Cache</p>
                            <p className="text-sm text-gray-500">Remove all cached data</p>
                        </div>
                        <Button type="button" variant="outline" className="px-4 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition">
                            Clear Cache
                        </Button>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button type="button" className="px-6 py-2 bg-admin-blue text-white rounded-lg hover:bg-admin-blue/90 transition">
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
