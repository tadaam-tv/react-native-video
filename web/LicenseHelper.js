import { fromByteArray, toByteArray } from "base64-js";

class LicenseHelper {
    static buildWidevineRequest(customerId, deviceId, request) {
        request.allowCrossSiteCredentials = false;
        const wrapped = {};
        wrapped.LatensRegistration = {
            CustomerName: customerId,
            AccountName: "PlayReadyAccount",
            PortalId: deviceId,
            FriendlyName: "ShakaPlayer",
            DeviceInfo: {
                FormatVersion: "1",
                DeviceType: "Web",
                OSType: "Tizen",
                OSVersion: "0.0.0",
                DRMProvider: "Google",
                DRMVersion: "1.4.8.86",
                DRMType: "Widevine",
                DeviceVendor: "Samsung",
                DeviceModel: "Tizen"
            }
        };

        wrapped.Payload = fromByteArray(new Uint8Array(request.body));
        const wrappedJson = JSON.stringify(wrapped);
        request.body = fromByteArray(new TextEncoder().encode(wrappedJson));
        return request;
    }

    static buildPlayReadyRequest(customerId, deviceId, request) {
        const cdata = { 
            "LatensRegistration" : {
                CustomerName: customerId,
                AccountName: "PlayReadyAccount",
                PortalId: deviceId,
                FriendlyName: "ShakaPlayer",
                DeviceInfo: {
                    FormatVersion: "1",
                    DeviceType: "Web",
                    OSType: "Tizen",
                    OSVersion: "0.0.0",
                    DRMProvider: "Microsoft",
                    DRMVersion: "3",
                    DRMType: "Playready",
                    DeviceVendor: "Samsung",
                    DeviceModel: "Tizen"
                }
            }
        };
        const cdataBase64 = fromByteArray(new TextEncoder().encode(JSON.stringify(cdata)));
        try {
            const wrapped = 
            `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                    <AcquireLicense xmlns="http://schemas.microsoft.com/DRM/2007/03/protocols">
                        <challenge>${toByteArray(response.body)}</challenge>
                    </AcquireLicense>
                </soap:Body>
            </soap:Envelope>`;
            request.body = wrapped;
        } catch(error) {
            console.log('buildPlayReadyRequest', `Error : ${error}`);
        }
        request.headers = {
            'x-titanium-drm-cdata': cdataBase64, 
            'Content-Type': 'text/xml; charset=utf-8',
            'soapaction': 'http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense'
        };
        return request;
    }

    static handleWidevineResponse(response) {
        const responseString = String.fromCharCode.apply(
            String,
            new Uint8Array(response.data)
        );
        let responseJson;
        try {
            responseJson = JSON.parse(responseString);
        } catch (error) {
            // not a license response, return challenge
            return response;
        }
        // This is a base64-encoded version of the raw license.
        const rawLicenseBase64 = responseJson.license;
        // Decode that base64 string into a Uint8Array and replace the response
        // data.  The raw license will be fed to the Widevine CDM.
        response.data = toByteArray(rawLicenseBase64);
        return response;
    }

    static handlePlayReadyResponse(response) {
        return response;
    }
}

export default LicenseHelper;