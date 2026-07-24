import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Dog Food Helper
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Personalized dog food recommendations based on your dog's health,
          restrictions, and individual response patterns.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Sign In
            </h2>
            <p className="text-gray-600 mb-4">
              Log in to access your dog profiles and personalized recommendations.
            </p>
            <Link
              href="/signin"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Sign In
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Create Account
            </h2>
            <p className="text-gray-600 mb-4">
              New to Dog Food Helper? Create an account to get started.
            </p>
            <Link
              href="/signup"
              className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              Sign Up
            </Link>
          </div>
        </div>

        <div className="mt-12 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            ⚠️ Disclaimer
          </h3>
          <p className="text-gray-700">
            Dog Food Helper is a decision-support tool, not a diagnostic or veterinary
            service. Always consult your veterinarian before making significant changes
            to your dog's diet, especially if your dog has existing health conditions.
          </p>
        </div>
      </div>
    </main>
  );
}
